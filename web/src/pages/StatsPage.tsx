import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchGames } from '../api';
import { useYearFilter } from '../useYearFilter';
import YearSelect from '../components/YearSelect';

interface PlayerStats {
  name: string;
  gameCount: number;
  totalPoint: number;
  rankCounts: [number, number, number, number];
  boxCount: number;
}

export default function StatsPage() {
  const { data: games, isLoading, error } = useQuery({ queryKey: ['games'], queryFn: fetchGames });
  const { year, setYear, years, filteredGames } = useYearFilter(games);

  const stats = useMemo(() => {
    const map = new Map<number, PlayerStats>();
    for (const game of filteredGames) {
      for (const r of game.results) {
        let s = map.get(r.playerId);
        if (!s) {
          s = { name: r.playerName, gameCount: 0, totalPoint: 0, rankCounts: [0, 0, 0, 0], boxCount: 0 };
          map.set(r.playerId, s);
        }
        s.gameCount++;
        s.totalPoint += r.point;
        s.rankCounts[r.rank - 1]++;
        if (r.finalScore < 0) s.boxCount++;
      }
    }
    return [...map.values()].sort((a, b) => b.totalPoint - a.totalPoint);
  }, [filteredGames]);

  const gameCounts = stats.map((s) => s.gameCount);
  const gameCountLabel =
    gameCounts.length === 0
      ? null
      : gameCounts.every((c) => c === gameCounts[0])
        ? `試合数: ${gameCounts[0]}`
        : `試合数: ${Math.min(...gameCounts)}〜${Math.max(...gameCounts)}（メンバー間で差あり）`;

  if (isLoading) return <p className="text-gray-500">読み込み中…</p>;
  if (error) return <p className="text-red-600">読み込みに失敗しました: {String(error)}</p>;

  const fmtRate = (count: number, total: number) => `${count} (${total === 0 ? 0 : Math.round((count / total) * 100)}%)`;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <h2 className="text-xl font-bold">集計表</h2>
        <YearSelect year={year} years={years} onChange={setYear} />
        {gameCountLabel && <span className="text-sm text-gray-600">{gameCountLabel}</span>}
      </div>
      {stats.length === 0 ? (
        <p className="text-gray-500">対象期間の記録がありません。</p>
      ) : (
        <div className="overflow-x-auto rounded-lg bg-white shadow">
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="bg-emerald-700 text-white">
              <tr>
                {['順位', '名前', '合計pt', '平均着順', '1位', '2位', '3位', '4位', '箱下'].map((h, idx) => (
                  <th
                    key={h}
                    className={`px-3 py-2 text-right first:text-center [&:nth-child(2)]:text-left whitespace-nowrap ${
                      idx <= 1 ? 'sticky left-0 bg-emerald-700' : ''
                    } ${idx === 1 ? 'left-[3.25rem]' : ''}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.map((s, i) => {
                const avgRank =
                  s.rankCounts.reduce((acc, count, idx) => acc + count * (idx + 1), 0) / s.gameCount;
                return (
                  <tr key={s.name} className="border-t border-gray-100 hover:bg-emerald-50/50">
                    <td className="sticky left-0 bg-white px-3 py-2 text-center font-bold">{i + 1}</td>
                    <td className="sticky left-[3.25rem] bg-white px-3 py-2 font-medium">{s.name}</td>
                    <td
                      className={`px-3 py-2 text-right font-semibold ${s.totalPoint > 0 ? 'text-red-600' : s.totalPoint < 0 ? 'text-blue-600' : ''}`}
                    >
                      {(s.totalPoint > 0 ? '+' : '') + s.totalPoint.toFixed(1)}
                    </td>
                    <td className="px-3 py-2 text-right">{avgRank.toFixed(2)}</td>
                    {s.rankCounts.map((count, idx) => (
                      <td key={idx} className="px-3 py-2 text-right">
                        {fmtRate(count, s.gameCount)}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right">{fmtRate(s.boxCount, s.gameCount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
