import { useMemo } from 'react';
import { SEAT_LABELS, computeGame, hasTie, validateGameScores, type Player, type Rule, type Seat } from '@mahjong/shared';

export type AnalyzeStatus = 'idle' | 'analyzing' | 'done' | 'error';

export interface GameEntry {
  id: string;
  previewUrl: string | null;
  imageData: { base64: string; mediaType: string } | null;
  analyzeStatus: AnalyzeStatus;
  analyzeError: string;
  rule: Rule;
  scores: (number | '')[];
  kicker: Seat | '';
  remarks: string;
  seatPlayers: (number | '')[];
}

export function emptyEntry(): GameEntry {
  return {
    id: crypto.randomUUID(),
    previewUrl: null,
    imageData: null,
    analyzeStatus: 'idle',
    analyzeError: '',
    rule: '5-10',
    scores: ['', '', '', ''],
    kicker: '',
    remarks: '',
    seatPlayers: ['', '', '', ''],
  };
}

/** 手動入力のみで未着手（画像なし・点数未入力）かどうか */
export function isBlankEntry(e: GameEntry): boolean {
  return e.previewUrl === null && e.imageData === null && e.scores.every((s) => s === '');
}

interface GameEntryCardProps {
  entry: GameEntry;
  index: number;
  players: Player[] | undefined;
  memberMode: 'common' | 'perImage';
  seats: (number | '')[];
  onUpdate: (patch: Partial<GameEntry>) => void;
  onRemove: () => void;
  onAnalyze: () => void;
  canRemove: boolean;
}

/** 1試合分の入力カード */
export default function GameEntryCard({
  entry,
  index,
  players,
  memberMode,
  seats,
  onUpdate,
  onRemove,
  onAnalyze,
  canRemove,
}: GameEntryCardProps) {
  const playerName = (id: number | '') => players?.find((p) => p.id === id)?.name ?? '';

  const numericScores = entry.scores.every((s) => s !== '') ? entry.scores.map(Number) : null;
  const scoreErrors = numericScores ? validateGameScores(numericScores) : [];
  const tie = numericScores ? hasTie(numericScores) : false;

  const seatsFilled = seats.every((p) => p !== '');
  const seatsDistinct = new Set(seats).size === 4;

  const preview = useMemo(() => {
    if (!numericScores || scoreErrors.length > 0) return null;
    if (tie && entry.kicker === '') return null;
    try {
      return computeGame(numericScores, entry.rule, tie ? (entry.kicker as Seat) : null);
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numericScores?.join(','), entry.rule, entry.kicker, tie, scoreErrors.length]);

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-semibold text-gray-700">試合{index + 1}</p>
        {canRemove && (
          <button type="button" onClick={onRemove} className="text-xs text-red-600 hover:underline">
            この試合を削除
          </button>
        )}
      </div>

      {entry.previewUrl && (
        <div className="mb-4 space-y-2">
          <img src={entry.previewUrl} alt="点数表示" className="max-h-48 rounded border border-gray-200" />
          <div>
            <button
              type="button"
              onClick={onAnalyze}
              disabled={entry.analyzeStatus === 'analyzing' || !entry.imageData}
              className="rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              {entry.analyzeStatus === 'analyzing'
                ? '解析中…'
                : entry.analyzeStatus === 'done'
                  ? '再解析する'
                  : 'AIで点数を解析（Gemini）'}
            </button>
          </div>
          {entry.analyzeError && (
            <p className="text-sm text-red-600">
              {entry.analyzeError}
              <br />
              <span className="text-amber-700">解析が使えないときは、下の表に点数を直接入力してください。</span>
            </p>
          )}
        </div>
      )}

      <label className="mb-3 block text-sm">
        <span className="mb-1 block font-medium">順位点</span>
        <select
          value={entry.rule}
          onChange={(e) => onUpdate({ rule: e.target.value as Rule })}
          className="rounded border border-gray-300 px-3 py-2"
        >
          <option value="5-10">5-10（±5,000 / ±10,000）</option>
          <option value="10-30">10-30（±10,000 / ±30,000）</option>
        </select>
      </label>

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
                {memberMode === 'perImage' ? (
                  <select
                    value={entry.seatPlayers[seat]}
                    onChange={(e) => {
                      const next = [...entry.seatPlayers];
                      next[seat] = e.target.value === '' ? '' : Number(e.target.value);
                      onUpdate({ seatPlayers: next });
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
                ) : (
                  <span className="text-gray-700">{playerName(seats[seat]) || '（未選択）'}</span>
                )}
              </td>
              <td className="py-1">
                <input
                  type="number"
                  step={100}
                  value={entry.scores[seat]}
                  onChange={(e) => {
                    const next = [...entry.scores];
                    next[seat] = e.target.value === '' ? '' : Number(e.target.value);
                    onUpdate({ scores: next });
                  }}
                  className="w-32 rounded border border-gray-300 px-2 py-1.5 text-right"
                  placeholder="25000"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {memberMode === 'perImage' && !seatsDistinct && seatsFilled && (
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
            value={entry.kicker}
            onChange={(e) => onUpdate({ kicker: e.target.value === '' ? '' : (Number(e.target.value) as Seat) })}
            className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">起家を選択…</option>
            {SEAT_LABELS.map((label, seat) => (
              <option key={seat} value={seat}>
                {label} {playerName(seats[seat])}
              </option>
            ))}
          </select>
        </div>
      )}

      <label className="mt-4 block text-sm">
        <span className="mb-1 block font-medium">備考</span>
        <textarea
          value={entry.remarks}
          onChange={(e) => onUpdate({ remarks: e.target.value })}
          rows={2}
          className="w-full rounded border border-gray-300 px-3 py-2"
          placeholder="役満、ハコ下など自由に"
        />
      </label>

      <div className="mt-4">
        {preview ? (
          <table className="w-full text-sm">
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
                    <td className="py-1.5">{playerName(seats[r.seat]) || `（${SEAT_LABELS[r.seat]}）`}</td>
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
          <p className="text-sm text-gray-500">点数を入力するとここに着順とポイントが表示されます。</p>
        )}
      </div>
    </div>
  );
}

/** カード単体としてのバリデーション（登録可否判定に使用） */
export function isEntryValid(entry: GameEntry, memberMode: 'common' | 'perImage', seats: (number | '')[]): boolean {
  const numericScores = entry.scores.every((s) => s !== '') ? entry.scores.map(Number) : null;
  if (!numericScores) return false;
  if (validateGameScores(numericScores).length > 0) return false;
  const tie = hasTie(numericScores);
  if (tie && entry.kicker === '') return false;
  if (memberMode === 'perImage') {
    const seatsFilled = seats.every((p) => p !== '');
    const seatsDistinct = new Set(seats).size === 4;
    if (!seatsFilled || !seatsDistinct) return false;
  }
  return true;
}
