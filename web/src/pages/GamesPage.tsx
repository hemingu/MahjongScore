import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Game } from '@mahjong/shared';
import { deleteGame, fetchGames } from '../api';
import { useAuth } from '../useAuth';
import { buildGameNoMap } from '../gameNo';

function fmtPoint(p: number): string {
  return (p > 0 ? '+' : '') + p.toFixed(1);
}

const RANK_COLORS = ['text-red-600', 'text-gray-800', 'text-gray-800', 'text-blue-600'];

export default function GamesPage() {
  const loggedIn = useAuth();
  const queryClient = useQueryClient();
  const { data: games, isLoading, error } = useQuery({ queryKey: ['games'], queryFn: fetchGames });
  const [sortDesc, setSortDesc] = useState(true);
  const del = useMutation({
    mutationFn: deleteGame,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['games'] }),
  });

  const gameNoMap = useMemo(() => buildGameNoMap(games ?? []), [games]);

  const sortedGames = useMemo(() => {
    const list = [...(games ?? [])];
    // API は (played_at desc, id desc) で返る = デフォルト降順のまま
    if (!sortDesc) list.reverse();
    return list;
  }, [games, sortDesc]);

  if (isLoading) return <p className="text-gray-500">読み込み中…</p>;
  if (error) return <p className="text-red-600">読み込みに失敗しました: {String(error)}</p>;
  if (!games || games.length === 0) return <p className="text-gray-500">まだ記録がありません。</p>;

  const renderGameNo = (game: Game) => gameNoMap.get(game.id) ?? '-';

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold">記録一覧（{games.length}試合）</h2>
        <button
          onClick={() => setSortDesc((v) => !v)}
          className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50 md:hidden"
        >
          試合数 {sortDesc ? '▼' : '▲'}
        </button>
      </div>

      {/* デスクトップ: テーブル */}
      <div className="hidden overflow-x-auto rounded-lg bg-white shadow md:block">
        <table className="w-full text-sm">
          <thead className="bg-emerald-700 text-white">
            <tr>
              <th className="px-3 py-2 text-left whitespace-nowrap">
                <button
                  onClick={() => setSortDesc((v) => !v)}
                  className="flex items-center gap-1 hover:underline"
                >
                  試合数 {sortDesc ? '▼' : '▲'}
                </button>
              </th>
              <th className="px-3 py-2 text-left whitespace-nowrap">日付</th>
              {[1, 2, 3, 4].map((r) => (
                <th key={r} className="px-3 py-2 text-left whitespace-nowrap">
                  {r}位
                </th>
              ))}
              <th className="px-3 py-2 text-left whitespace-nowrap">順位点</th>
              <th className="px-3 py-2 text-left">備考</th>
              {loggedIn && <th className="px-2 py-2" />}
            </tr>
          </thead>
          <tbody>
            {sortedGames.map((game) => {
              const byRank = [...game.results].sort((a, b) => a.rank - b.rank);
              return (
                <tr key={game.id} className="border-t border-gray-100 hover:bg-emerald-50/50">
                  <td className="px-3 py-2 whitespace-nowrap">{renderGameNo(game)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{game.playedAt}</td>
                  {byRank.map((r) => (
                    <td key={r.seat} className="px-3 py-2 whitespace-nowrap">
                      <span className="font-medium">{r.playerName}</span>
                      <br />
                      <span className="text-xs text-gray-500">{r.finalScore.toLocaleString()}点</span>{' '}
                      <span className={`text-xs font-semibold ${RANK_COLORS[r.rank - 1]}`}>
                        {fmtPoint(r.point)}
                      </span>
                    </td>
                  ))}
                  <td className="px-3 py-2 whitespace-nowrap">{game.rule}</td>
                  <td className="px-3 py-2 max-w-60 break-words text-gray-700">{game.remarks}</td>
                  {loggedIn && (
                    <td className="px-2 py-2">
                      <button
                        onClick={() => {
                          if (confirm(`${game.playedAt} の記録を削除しますか？`)) del.mutate(game.id);
                        }}
                        className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                      >
                        削除
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* モバイル: カードリスト */}
      <div className="space-y-3 md:hidden">
        {sortedGames.map((game) => {
          const byRank = [...game.results].sort((a, b) => a.rank - b.rank);
          return (
            <div key={game.id} className="rounded-lg bg-white p-4 shadow">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-bold">第{renderGameNo(game)}試合</span>
                <span className="text-gray-600">{game.playedAt}</span>
                <span className="text-gray-600">{game.rule}</span>
              </div>
              <div className="space-y-1">
                {byRank.map((r) => (
                  <div key={r.seat} className="flex items-center justify-between text-sm">
                    <span className="w-10 font-bold">{r.rank}位</span>
                    <span className="flex-1 font-medium">{r.playerName}</span>
                    <span className="w-20 text-right text-xs text-gray-500">
                      {r.finalScore.toLocaleString()}点
                    </span>
                    <span className={`w-16 text-right text-xs font-semibold ${RANK_COLORS[r.rank - 1]}`}>
                      {fmtPoint(r.point)}
                    </span>
                  </div>
                ))}
              </div>
              {game.remarks && <p className="mt-2 text-xs text-gray-700">{game.remarks}</p>}
              {loggedIn && (
                <button
                  onClick={() => {
                    if (confirm(`${game.playedAt} の記録を削除しますか？`)) del.mutate(game.id);
                  }}
                  className="mt-3 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                >
                  削除
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
