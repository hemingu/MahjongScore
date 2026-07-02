import { useMemo, useState } from 'react';
import type { Game } from '@mahjong/shared';

/** 年フィルタの状態とロジックを共通化するフック。デフォルトは記録にある最新の年 */
export function useYearFilter(games: Game[] | undefined) {
  const [selected, setSelected] = useState<string | null>(null);

  const years = useMemo(
    () => [...new Set((games ?? []).map((g) => g.playedAt.slice(0, 4)))].sort().reverse(),
    [games],
  );

  // 未選択の間は最新年（記録がなければ全期間）
  const year = selected ?? years[0] ?? 'all';

  const filteredGames = useMemo(
    () => (games ?? []).filter((g) => year === 'all' || g.playedAt.startsWith(year)),
    [games, year],
  );

  return { year, setYear: setSelected, years, filteredGames };
}
