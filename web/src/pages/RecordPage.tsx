import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import {
  SEAT_LABELS,
  computeGame,
  hasTie,
  validateGameScores,
  type Rule,
  type Seat,
} from '@mahjong/shared';
import { addGame, addYakuman, analyzeImage, fetchGames, fetchPlayers } from '../api';
import { fileToResizedBase64 } from '../image';
import YakumanForm, { emptyYakumanEntry, validateYakumanEntry, type YakumanEntry } from '../components/YakumanForm';
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

function GameRecordTab() {
  const { data: players } = useQuery({ queryKey: ['players'], queryFn: fetchPlayers });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageData, setImageData] = useState<{ base64: string; mediaType: string } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState('');

  const [playedAt, setPlayedAt] = useState(today());
  const [rule, setRule] = useState<Rule>('5-10');
  const [seatPlayers, setSeatPlayers] = useState<(number | '')[]>(['', '', '', '']);
  const [scores, setScores] = useState<(number | '')[]>(['', '', '', '']);
  const [kicker, setKicker] = useState<Seat | ''>('');
  const [remarks, setRemarks] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [yakumanEntries, setYakumanEntries] = useState<YakumanEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const onSelectFile = async (file: File | undefined) => {
    setAnalyzeError('');
    if (!file) return;
    setPreviewUrl(URL.createObjectURL(file));
    try {
      setImageData(await fileToResizedBase64(file));
    } catch {
      setAnalyzeError('画像の読み込みに失敗しました');
    }
  };

  const onAnalyze = async () => {
    if (!imageData) return;
    setAnalyzing(true);
    setAnalyzeError('');
    try {
      const result = await analyzeImage(imageData.base64, imageData.mediaType);
      setScores([result.bottom*100, result.right*100, result.top*100, result.left*100]);
    } catch (e) {
      setAnalyzeError(e instanceof Error ? e.message : '解析に失敗しました');
    } finally {
      setAnalyzing(false);
    }
  };

  const numericScores = scores.every((s) => s !== '') ? scores.map(Number) : null;
  const scoreErrors = numericScores ? validateGameScores(numericScores) : [];
  const tie = numericScores ? hasTie(numericScores) : false;

  const preview = useMemo(() => {
    if (!numericScores || scoreErrors.length > 0) return null;
    if (tie && kicker === '') return null;
    try {
      return computeGame(numericScores, rule, tie ? (kicker as Seat) : null);
    } catch {
      return null;
    }
  }, [numericScores?.join(','), rule, kicker, tie, scoreErrors.length]);

  const seatsFilled = seatPlayers.every((p) => p !== '');
  const seatsDistinct = new Set(seatPlayers).size === 4;
  const canSubmit =
    !!preview && seatsFilled && seatsDistinct && /^\d{4}-\d{2}-\d{2}$/.test(playedAt);

  const submit = useMutation({
    mutationFn: addGame,
  });

  const playerName = (id: number | '') => players?.find((p) => p.id === id)?.name ?? '';

  const yakumanPlayerOptions = seatPlayers.map((id, seat) => ({
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

    // 役満のバリデーション（送信前に全件チェック）
    for (const entry of yakumanEntries) {
      const err = validateYakumanEntry(entry);
      if (err) {
        setSubmitError(err);
        return;
      }
    }

    setSubmitting(true);
    try {
      const { id: gameId } = await submit.mutateAsync({
        playedAt,
        rule,
        kickerSeat: tie ? (kicker as Seat) : null,
        remarks,
        entries: seatPlayers.map((playerId, seat) => ({
          playerId: playerId as number,
          finalScore: Number(scores[seat]),
        })),
      });

      for (const entry of yakumanEntries) {
        await addYakuman({
          gameId,
          winnerPlayerId: entry.winnerPlayerId as number,
          loserPlayerId: entry.loserPlayerId === '' ? null : entry.loserPlayerId,
          isDealer: entry.isDealer,
          yaku: entry.yaku.filter((y) => y.trim() !== ''),
        });
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['games'] }),
        queryClient.invalidateQueries({ queryKey: ['yakuman'] }),
      ]);
      navigate('/games');
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : '登録に失敗しました');
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
          capture="environment"
          onChange={(e) => onSelectFile(e.target.files?.[0])}
          className="block w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-emerald-700 file:px-4 file:py-2 file:text-white"
        />
        {previewUrl && (
          <div className="mt-3 space-y-3">
            <img src={previewUrl} alt="点数表示" className="max-h-64 rounded border border-gray-200" />
            <button
              onClick={onAnalyze}
              disabled={analyzing || !imageData}
              className="rounded bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              {analyzing ? '解析中…' : 'AIで点数を解析（Gemini）'}
            </button>
          </div>
        )}
        {analyzeError && (
          <p className="mt-2 text-sm text-red-600">
            {analyzeError}
            <br />
            <span className="text-amber-700">解析が使えないときは、②の表に点数を直接入力してください。</span>
          </p>
        )}
        <p className="mt-2 text-xs text-gray-500">
          点数の配置: 下=自分 / 右 / 上 / 左。解析結果は②の表で修正できます。
          写真を使わず②に手動入力するだけでも記録できます。
        </p>
      </section>

      {/* 2. 試合情報 */}
      <section className="rounded-lg bg-white p-5 shadow">
        <h3 className="mb-3 font-semibold">② 試合情報</h3>
        <div className="mb-4 flex flex-wrap gap-4">
          <label className="text-sm">
            <span className="mb-1 block font-medium">日付</span>
            <input
              type="date"
              value={playedAt}
              onChange={(e) => setPlayedAt(e.target.value)}
              className="rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">順位点</span>
            <select
              value={rule}
              onChange={(e) => setRule(e.target.value as Rule)}
              className="rounded border border-gray-300 px-3 py-2"
            >
              <option value="5-10">5-10（±5,000 / ±10,000）</option>
              <option value="10-30">10-30（±10,000 / ±30,000）</option>
            </select>
          </label>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-600">
              <th className="py-1">席</th>
              <th className="py-1">メンバー</th>
              <th className="py-1">終了時点数</th>
            </tr>
          </thead>
          <tbody>
            {SEAT_LABELS.map((label, seat) => (
              <tr key={seat}>
                <td className="py-1 pr-3 whitespace-nowrap">{label}</td>
                <td className="py-1 pr-3">
                  <select
                    value={seatPlayers[seat]}
                    onChange={(e) => {
                      const next = [...seatPlayers];
                      next[seat] = e.target.value === '' ? '' : Number(e.target.value);
                      setSeatPlayers(next);
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
                <td className="py-1">
                  <input
                    type="number"
                    step={100}
                    value={scores[seat]}
                    onChange={(e) => {
                      const next = [...scores];
                      next[seat] = e.target.value === '' ? '' : Number(e.target.value);
                      setScores(next);
                    }}
                    className="w-32 rounded border border-gray-300 px-2 py-1.5 text-right"
                    placeholder="25000"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!seatsDistinct && seatsFilled && (
          <p className="mt-2 text-sm text-red-600">同じメンバーが複数の席に選択されています</p>
        )}
        {scoreErrors.map((e) => (
          <p key={e} className="mt-2 text-sm text-red-600">
            {e}
          </p>
        ))}

        {tie && (
          <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3">
            <p className="mb-2 text-sm font-medium text-amber-800">
              同点の人がいます。着順を決めるため起家（東スタート）を選んでください。
            </p>
            <select
              value={kicker}
              onChange={(e) => setKicker(e.target.value === '' ? '' : (Number(e.target.value) as Seat))}
              className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
            >
              <option value="">起家を選択…</option>
              {SEAT_LABELS.map((label, seat) => (
                <option key={seat} value={seat}>
                  {label} {playerName(seatPlayers[seat])}
                </option>
              ))}
            </select>
          </div>
        )}

        <label className="mt-4 block text-sm">
          <span className="mb-1 block font-medium">備考</span>
          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            rows={2}
            className="w-full rounded border border-gray-300 px-3 py-2"
            placeholder="役満、ハコ下など自由に"
          />
        </label>
      </section>

      {/* 3. 役満（任意） */}
      <section className="rounded-lg bg-white p-5 shadow">
        <h3 className="mb-3 font-semibold">③ 役満（任意）</h3>
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
      </section>

      {/* 4. 確認 */}
      <section className="rounded-lg bg-white p-5 shadow">
        <h3 className="mb-3 font-semibold">④ 確認して登録</h3>
        {preview ? (
          <table className="mb-4 w-full text-sm">
            <thead>
              <tr className="text-left text-gray-600">
                <th className="py-1">着順</th>
                <th className="py-1">メンバー</th>
                <th className="py-1 text-right">点数</th>
                <th className="py-1 text-right">ポイント</th>
              </tr>
            </thead>
            <tbody>
              {[...preview]
                .sort((a, b) => a.rank - b.rank)
                .map((r) => (
                  <tr key={r.seat} className="border-t border-gray-100">
                    <td className="py-1.5 font-bold">{r.rank}位</td>
                    <td className="py-1.5">
                      {playerName(seatPlayers[r.seat]) || `（${SEAT_LABELS[r.seat]}）`}
                    </td>
                    <td className="py-1.5 text-right">{r.finalScore.toLocaleString()}点</td>
                    <td
                      className={`py-1.5 text-right font-semibold ${r.point > 0 ? 'text-red-600' : r.point < 0 ? 'text-blue-600' : ''}`}
                    >
                      {(r.point > 0 ? '+' : '') + r.point.toFixed(1)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        ) : (
          <p className="mb-4 text-sm text-gray-500">点数を入力するとここに着順とポイントが表示されます。</p>
        )}
        {submitError && <p className="mb-2 text-sm whitespace-pre-line text-red-600">{submitError}</p>}
        <button
          onClick={onSubmit}
          disabled={!canSubmit || submitting}
          className="w-full rounded bg-emerald-700 py-2.5 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {submitting ? '登録中…' : 'この内容で登録する'}
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
