import type { Game } from '@mahjong/shared';

/**
 * 通算試合数を解決するマップを作る。
 * API は (played_at desc, id desc) で返すため、(playedAt, id) 昇順で1から採番し直す。
 */
export function buildGameNoMap(games: Game[]): Map<number, number> {
  const sorted = [...games].sort((a, b) => {
    if (a.playedAt !== b.playedAt) return a.playedAt < b.playedAt ? -1 : 1;
    return a.id - b.id;
  });
  const map = new Map<number, number>();
  sorted.forEach((g, i) => map.set(g.id, i + 1));
  return map;
}
