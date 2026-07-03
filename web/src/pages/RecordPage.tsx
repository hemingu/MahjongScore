import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { SEAT_LABELS, hasTie, type GameInput, type Seat } from '@mahjong/shared';
import { addGamesBulk, addYakuman, analyzeImage, fetchGames, fetchPlayers } from '../api';
import { fileToResizedBase64 } from '../image';
import YakumanForm, { emptyYakumanEntry, validateYakumanEntry, type YakumanEntry } from '../components/YakumanForm';
import GameEntryCard, {
  emptyEntry,
  isBlankEntry,
  isEntryValid,
  type GameEntry,
} from '../components/GameEntryCard';
import { buildGameNoMap } from '../gameNo';

function today(): string {
  return new Date().toLocaleDateString('sv-SE');
}

type Tab = 'game' | 'yakumanOnly';

export default function RecordPage() {
  const [tab, setTab] = useState<Tab>('game');

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h2 className="text-xl font-bold">記録する</h2>

      <div className="flex gap-1 rounded-lg bg-emerald-100 p-1 text-sm">
        <button
          onClick={() => setTab('game')}
          className={`flex-1 rounded px-3 py-2 font-semibold transition ${
            tab === 'game' ? 'bg-emerald-700 text-white shadow' : 'text-emerald-800 hover:bg-emerald-200'
          }`}
        >
          試合を記録
        </button>
        <button
          onClick={() => setTab('yakumanOnly')}
          className={`flex-1 rounded px-3 py-2 font-semibold transition ${
            tab === 'yakumanOnly' ? 'bg-emerald-700 text-white shadow' : 'text-emerald-800 hover:bg-emerald-200'
          }`}
        >
          役満のみ記録
        </button>
      </div>

      {tab === 'game' ? <GameRecordTab /> : <YakumanOnlyTab />}
    </div>
  );
}

type MemberMode = 'common' | 'perImage';

function GameRecordTab() {
  const { data: players } = useQuery({ queryKey: ['players'], queryFn: fetchPlayers });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [entries, setEntries] = useState<GameEntry[]>([emptyEntry()]);
  const [memberMode, setMemberMode] = useState<MemberMode>('common');
  const [commonSeatPlayers, setCommonSeatPlayers] = useState<(number | '')[]>(['', '', '', '']);
  const [playedAt, setPlayedAt] = useState(today());
  const [submitError, setSubmitError] = useState('');
  const [yakumanEntries, setYakumanEntries] = useState<YakumanEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const updateEntry = (id: string, patch: Partial<GameEntry>) =>
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const seatsOf = (e: GameEntry) => (memberMode === 'common' ? commonSeatPlayers : e.seatPlayers);

  const onSelectFiles = async (files: FileList | null) => {
    const list = Array.from(files ?? []);
    if (list.length === 0) return;

    const newEntries: GameEntry[] = [];
    for (const file of list) {
      const entry = emptyEntry();
      entry.previewUrl = URL.createObjectURL(file);
      try {
        entry.imageData = await fileToResizedBase64(file);
      } catch {
        entry.analyzeError = '画像の読み込みに失敗しました';
      }
      newEntries.push(entry);
    }

    setEntries((prev) => {
      if (prev.length === 1 && isBlankEntry(prev[0])) return newEntries;
      return [...prev, ...newEntries];
    });

    if (fileRef.current) fileRef.current.value = '';
  };

  const removeEntry = (id: string) => {
    setEntries((prev) => {
      const target = prev.find((e) => e.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      const next = prev.filter((e) => e.id !== id);
      return next.length === 0 ? [emptyEntry()] : next;
    });
  };

  const analyzeOne = async (entry: GameEntry) => {
    if (!entry.imageData) return;
    const imageData = entry.imageData;
    updateEntry(entry.id, { analyzeStatus: 'analyzing', analyzeError: '' });
    try {
      const result = await analyzeImage(imageData.base64, imageData.mediaType);
      updateEntry(entry.id, {
        analyzeStatus: 'done',
        scores: [result.bottom * 100, result.right * 100, result.top * 100, result.left * 100],
      });
    } catch (e) {
      updateEntry(entry.id, {
        analyzeStatus: 'error',
        analyzeError: e instanceof Error ? e.message : '解析に失敗しました',
      });
    }
  };

  const analyzeAll = async () => {
    for (const entry of entries) {
      if (entry.imageData && entry.analyzeStatus !== 'done') {
        await analyzeOne(entry);
      }
    }
  };

  const imageEntries = entries.filter((e) => e.imageData);
  const anyAnalyzing = entries.some((e) => e.analyzeStatus === 'analyzing');

  const commonSeatsFilled = commonSeatPlayers.every((p) => p !== '');
  const commonSeatsDistinct = new Set(commonSeatPlayers).size === 4;

  const entriesValid = entries.every((e) => isEntryValid(e, memberMode, seatsOf(e)));
  const canSubmit =
    entriesValid &&
    (memberMode === 'perImage' || (commonSeatsFilled && commonSeatsDistinct)) &&
    /^\d{4}-\d{2}-\d{2}$/.test(playedAt);

  const playerName = (id: number | '') => players?.find((p) => p.id === id)?.name ?? '';

  const firstSeats: (number | '')[] = entries[0] ? seatsOf(entries[0]) : ['', '', '', ''];
  const yakumanPlayerOptions = firstSeats.map((id, seat) => ({
    id: typeof id === 'number' ? id : -1 - seat,
    name: playerName(id) || `（${SEAT_LABELS[seat]}）`,
  }));

  const addYakumanEntry = () => setYakumanEntries((prev) => [...prev, emptyYakumanEntry()]);
  const updateYakumanEntry = (idx: number, entry: YakumanEntry) =>
    setYakumanEntries((prev) => prev.map((e, i) => (i === idx ? entry : e)));
  const removeYakumanEntry = (idx: number) =>
    setYakumanEntries((prev) => prev.filter((_, i) => i !== idx));

  const onSubmit = async () => {
    if (!canSubmit) return;
    setSubmitError('');

    // 役満のバリデーション（送信前に全件チェック、単一試合登録時のみ）
    if (entries.length === 1) {
      for (const entry of yakumanEntries) {
        const err = validateYakumanEntry(entry);
        if (err) {
          setSubmitError(err);
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      const inputs: GameInput[] = entries.map((e) => {
        const numericScores = e.scores.map(Number);
        const tie = hasTie(numericScores);
        const seats = seatsOf(e);
        return {
          playedAt,
          rule: e.rule,
          kickerSeat: tie ? (e.kicker as Seat) : null,
          remarks: e.remarks,
          entries: seats.map((playerId, seat) => ({
            playerId: playerId as number,
            finalScore: Number(e.scores[seat]),
          })),
        };
      });

      const { ids } = await addGamesBulk(inputs);

      if (entries.length === 1) {
        const gameId = ids[0];
        for (const entry of yakumanEntries) {
          await addYakuman({
            gameId,
            winnerPlayerId: entry.winnerPlayerId as number,
            loserPlayerId: entry.loserPlayerId === '' ? null : entry.loserPlayerId,
            isDealer: entry.isDealer,
            yaku: entry.yaku.filter((y) => y.trim() !== ''),
          });
        }
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['games'] }),
        queryClient.invalidateQueries({ queryKey: ['yakuman'] }),
      ]);
      navigate('/games');
    } catch (e) {
      const message = e instanceof Error ? e.message : '登録に失敗しました';
      setSubmitError(message.replaceAll('行目', '試合目'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. 写真 */}
      <section className="rounded-lg bg-white p-5 shadow">
        <h3 className="mb-3 font-semibold">① 写真から自動入力（省略可）</h3>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => onSelectFiles(e.target.files)}
          className="block w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-emerald-700 file:px-4 file:py-2 file:text-white"
        />
        <p className="mt-2 text-xs text-gray-500">
          点数の配置: 下=自分 / 右 / 上 / 左。複数枚選択すると、1枚=1試合として下にカードが並びます。
          解析結果は③の表で修正できます。写真を使わず③に手動入力するだけでも記録できます。
        </p>
        {imageEntries.length >= 2 && (
          <button
            type="button"
            onClick={analyzeAll}
            disabled={anyAnalyzing}
            className="mt-3 rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {anyAnalyzing ? '解析中…' : 'すべて解析（Gemini）'}
          </button>
        )}
      </section>

      {/* 2. メンバー・日付 */}
      <section className="rounded-lg bg-white p-5 shadow">
        <h3 className="mb-3 font-semibold">② メンバー・日付</h3>

        <div className="mb-4 flex gap-1 rounded-lg bg-emerald-100 p-1 text-sm">
          <button
            type="button"
            onClick={() => setMemberMode('common')}
            className={`flex-1 rounded px-3 py-2 font-semibold transition ${
              memberMode === 'common' ? 'bg-emerald-700 text-white shadow' : 'text-emerald-800 hover:bg-emerald-200'
            }`}
          >
            全試合共通
          </button>
          <button
            type="button"
            onClick={() => setMemberMode('perImage')}
            className={`flex-1 rounded px-3 py-2 font-semibold transition ${
              memberMode === 'perImage' ? 'bg-emerald-700 text-white shadow' : 'text-emerald-800 hover:bg-emerald-200'
            }`}
          >
            試合ごとに選択
          </button>
        </div>

        <label className="mb-4 block text-sm">
          <span className="mb-1 block font-medium">日付</span>
          <input
            type="date"
            value={playedAt}
            onChange={(e) => setPlayedAt(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>

        {memberMode === 'common' && (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-600">
                  <th className="py-1">席</th>
                  <th className="py-1">メンバー</th>
                </tr>
              </thead>
              <tbody>
                {SEAT_LABELS.map((label, seat) => (
                  <tr key={seat}>
                    <td className="py-1 pr-3 whitespace-nowrap">{label}</td>
                    <td className="py-1 pr-3">
                      <select
                        value={commonSeatPlayers[seat]}
                        onChange={(e) => {
                          const next = [...commonSeatPlayers];
                          next[seat] = e.target.value === '' ? '' : Number(e.target.value);
                          setCommonSeatPlayers(next);
                        }}
                        className="w-full rounded border border-gray-300 px-2 py-1.5"
                      >
                        <option value="">選択…</option>
                        {players
                          ?.filter((p) => p.active)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!commonSeatsDistinct && commonSeatsFilled && (
              <p className="mt-2 text-sm text-red-600">同じメンバーが複数の席に選択されています</p>
            )}
          </>
        )}
        {memberMode === 'perImage' && (
          <p className="text-sm text-gray-500">メンバーは③の各試合カードで選択してください。</p>
        )}
      </section>

      {/* 3. 試合ごとの情報 */}
      <section className="rounded-lg bg-white p-5 shadow">
        <h3 className="mb-3 font-semibold">③ 試合ごとの情報</h3>
        <div className="space-y-4">
          {entries.map((entry, idx) => (
            <GameEntryCard
              key={entry.id}
              entry={entry}
              index={idx}
              players={players}
              memberMode={memberMode}
              seats={seatsOf(entry)}
              onUpdate={(patch) => updateEntry(entry.id, patch)}
              onRemove={() => removeEntry(entry.id)}
              onAnalyze={() => analyzeOne(entry)}
              canRemove={entries.length > 1}
            />
          ))}
        </div>
      </section>

      {/* 4. 役満（任意） */}
      <section className="rounded-lg bg-white p-5 shadow">
        <h3 className="mb-3 font-semibold">④ 役満（任意）</h3>
        {entries.length === 1 ? (
          <>
            <div className="space-y-3">
              {yakumanEntries.map((entry, idx) => (
                <YakumanForm
                  key={idx}
                  entry={entry}
                  onChange={(e) => updateYakumanEntry(idx, e)}
                  players={yakumanPlayerOptions}
                  onRemove={() => removeYakumanEntry(idx)}
                  title={`役満 ${idx + 1}`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={addYakumanEntry}
              className="mt-3 rounded border border-emerald-700 px-4 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
            >
              役満を追加
            </button>
          </>
        ) : (
          <p className="text-sm text-gray-500">
            複数試合の一括登録では、役満は登録後に「役満のみ記録」タブから追加してください。
          </p>
        )}
      </section>

      {/* 5. 確認 */}
      <section className="rounded-lg bg-white p-5 shadow">
        <h3 className="mb-3 font-semibold">⑤ 確認して登録</h3>
        {submitError && <p className="mb-2 text-sm whitespace-pre-line text-red-600">{submitError}</p>}
        <button
          onClick={onSubmit}
          disabled={!canSubmit || submitting}
          className="w-full rounded bg-emerald-700 py-2.5 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {submitting ? '登録中…' : `${entries.length}試合を登録する`}
        </button>
      </section>
    </div>
  );
}

function YakumanOnlyTab() {
  const { data: games } = useQuery({ queryKey: ['games'], queryFn: fetchGames });
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [gameId, setGameId] = useState<number | ''>('');
  const [entry, setEntry] = useState<YakumanEntry>(emptyYakumanEntry());
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const gameNoMap = useMemo(() => buildGameNoMap(games ?? []), [games]);

  const sortedGames = useMemo(
    () =>
      [...(games ?? [])].sort((a, b) => {
        if (a.playedAt !== b.playedAt) return a.playedAt < b.playedAt ? 1 : -1;
        return b.id - a.id;
      }),
    [games],
  );

  const selectedGame = games?.find((g) => g.id === gameId);
  const playerOptions = useMemo(
    () => (selectedGame ? selectedGame.results.map((r) => ({ id: r.playerId, name: r.playerName })) : []),
    [selectedGame],
  );

  const submit = useMutation({
    mutationFn: addYakuman,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['yakuman'] });
      setMessage('役満を登録しました');
      setEntry(emptyYakumanEntry());
      navigate('/yakuman');
    },
    onError: (e) => setError(e instanceof Error ? e.message : '登録に失敗しました'),
  });

  const onSubmit = () => {
    setError('');
    setMessage('');
    if (gameId === '') {
      setError('対象の試合を選択してください');
      return;
    }
    const err = validateYakumanEntry(entry);
    if (err) {
      setError(err);
      return;
    }
    submit.mutate({
      gameId,
      winnerPlayerId: entry.winnerPlayerId as number,
      loserPlayerId: entry.loserPlayerId === '' ? null : entry.loserPlayerId,
      isDealer: entry.isDealer,
      yaku: entry.yaku.filter((y) => y.trim() !== ''),
    });
  };

  return (
    <section className="rounded-lg bg-white p-5 shadow">
      <h3 className="mb-3 font-semibold">役満のみ記録</h3>
      <label className="mb-4 block text-sm">
        <span className="mb-1 block font-medium">対象の試合</span>
        <select
          value={gameId}
          onChange={(e) => setGameId(e.target.value === '' ? '' : Number(e.target.value))}
          className="w-full rounded border border-gray-300 px-3 py-2"
        >
          <option value="">選択…</option>
          {sortedGames.map((g) => (
            <option key={g.id} value={g.id}>
              第{gameNoMap.get(g.id)}試合 {g.playedAt}（{g.results.map((r) => r.playerName).join('・')}）
            </option>
          ))}
        </select>
      </label>

      <YakumanForm entry={entry} onChange={setEntry} players={playerOptions} />

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {message && <p className="mt-3 text-sm text-emerald-700">{message}</p>}
      <button
        onClick={onSubmit}
        disabled={submit.isPending}
        className="mt-4 w-full rounded bg-emerald-700 py-2.5 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
      >
        {submit.isPending ? '登録中…' : '登録する'}
      </button>
    </section>
  );
}
