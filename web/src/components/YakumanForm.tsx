import { YAKUMAN_PRESETS } from '../yakuman';

export interface YakumanEntry {
  winnerPlayerId: number | '';
  loserPlayerId: number | '' | null; // null = ツモ
  isDealer: boolean;
  yaku: [string, string, string, string];
}

export function emptyYakumanEntry(): YakumanEntry {
  return { winnerPlayerId: '', loserPlayerId: '', isDealer: false, yaku: ['', '', '', ''] };
}

interface YakumanFormProps {
  entry: YakumanEntry;
  onChange: (entry: YakumanEntry) => void;
  players: { id: number; name: string }[];
  onRemove?: () => void;
  title?: string;
}

/** 1件分の役満入力UI（制御コンポーネント） */
export default function YakumanForm({ entry, onChange, players, onRemove, title }: YakumanFormProps) {
  const set = <K extends keyof YakumanEntry>(key: K, value: YakumanEntry[K]) =>
    onChange({ ...entry, [key]: value });

  const setYaku = (idx: number, value: string) => {
    const next = [...entry.yaku] as YakumanEntry['yaku'];
    next[idx] = value;
    set('yaku', next);
  };

  return (
    <div className="rounded border border-gray-200 p-4">
      <div className="mb-3 flex items-center justify-between">
        {title && <p className="text-sm font-semibold text-gray-700">{title}</p>}
        {onRemove && (
          <button type="button" onClick={onRemove} className="ml-auto text-xs text-red-600 hover:underline">
            この役満を削除
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-4">
        <label className="text-sm">
          <span className="mb-1 block font-medium">和了者</span>
          <select
            value={entry.winnerPlayerId}
            onChange={(e) => set('winnerPlayerId', e.target.value === '' ? '' : Number(e.target.value))}
            className="rounded border border-gray-300 px-2 py-1.5"
          >
            <option value="">選択…</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">放銃者</span>
          <select
            value={entry.loserPlayerId === null ? 'none' : entry.loserPlayerId}
            onChange={(e) => set('loserPlayerId', e.target.value === 'none' ? null : e.target.value === '' ? '' : Number(e.target.value))}
            className="rounded border border-gray-300 px-2 py-1.5"
          >
            <option value="">選択…</option>
            <option value="none">なし（ツモ）</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="text-sm">
          <span className="mb-1 block font-medium">親 or 子</span>
          <div className="flex gap-3 pt-1.5">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={entry.isDealer}
                onChange={() => set('isDealer', true)}
              />
              親
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={!entry.isDealer}
                onChange={() => set('isDealer', false)}
              />
              子
            </label>
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {entry.yaku.map((y, idx) => (
          <label key={idx} className="text-sm">
            <span className="mb-1 block font-medium">
              役{idx + 1}
              {idx === 0 ? '' : '（任意）'}
            </span>
            <input
              list="yakuman-presets"
              value={y}
              onChange={(e) => setYaku(idx, e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1.5"
              placeholder={idx === 0 ? '例: 大三元' : ''}
            />
          </label>
        ))}
      </div>
      <datalist id="yakuman-presets">
        {YAKUMAN_PRESETS.map((y) => (
          <option key={y} value={y} />
        ))}
      </datalist>
    </div>
  );
}

/** 役満エントリの検証。問題があればエラーメッセージを返す（null = OK） */
export function validateYakumanEntry(entry: YakumanEntry): string | null {
  if (entry.winnerPlayerId === '' || (typeof entry.winnerPlayerId === 'number' && entry.winnerPlayerId < 0)) {
    return '役満の和了者を選択してください';
  }
  if (typeof entry.loserPlayerId === 'number' && entry.loserPlayerId < 0) {
    return '役満の放銃者を選択してください';
  }
  if (!entry.yaku[0].trim()) return '役満の役1は必須です';
  if (entry.loserPlayerId !== null && entry.loserPlayerId !== '' && entry.loserPlayerId === entry.winnerPlayerId) {
    return '役満の和了者と放銃者が同じです';
  }
  return null;
}
