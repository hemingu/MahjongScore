import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteYakuman, fetchGames, fetchYakuman } from '../api';
import { useAuth } from '../useAuth';
import { buildGameNoMap } from '../gameNo';

export default function YakumanPage() {
  const loggedIn = useAuth();
  const queryClient = useQueryClient();
  const { data: yakuman, isLoading, error } = useQuery({ queryKey: ['yakuman'], queryFn: fetchYakuman });
  const { data: games } = useQuery({ queryKey: ['games'], queryFn: fetchGames });

  const gameNoMap = useMemo(() => buildGameNoMap(games ?? []), [games]);

  const del = useMutation({
    mutationFn: deleteYakuman,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['yakuman'] }),
  });

  if (isLoading) return <p className="text-gray-500">読み込み中…</p>;
  if (error) return <p className="text-red-600">読み込みに失敗しました: {String(error)}</p>;

  return (
    <div>
      <h2 className="mb-4 text-xl font-bold">役満一覧</h2>
      {!yakuman || yakuman.length === 0 ? (
        <p className="text-gray-500">役満の記録はまだありません</p>
      ) : (
        <div className="overflow-x-auto rounded-lg bg-white shadow">
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="bg-emerald-700 text-white">
              <tr>
                <th className="px-3 py-2 text-left">試合数</th>
                <th className="px-3 py-2 text-left">日付</th>
                <th className="px-3 py-2 text-left">和了者</th>
                <th className="px-3 py-2 text-left">放銃者</th>
                <th className="px-3 py-2 text-left">親 or 子</th>
                <th className="px-3 py-2 text-left">役1</th>
                <th className="px-3 py-2 text-left">役2</th>
                <th className="px-3 py-2 text-left">役3</th>
                <th className="px-3 py-2 text-left">役4</th>
                {loggedIn && <th className="px-2 py-2" />}
              </tr>
            </thead>
            <tbody>
              {yakuman.map((y) => (
                <tr key={y.id} className="border-t border-gray-100 hover:bg-emerald-50/50">
                  <td className="px-3 py-2">
                    {gameNoMap.get(y.gameId) ? `第${gameNoMap.get(y.gameId)}試合` : '-'}
                  </td>
                  <td className="px-3 py-2">{y.playedAt}</td>
                  <td className="px-3 py-2 font-medium">{y.winnerName}</td>
                  <td className="px-3 py-2">{y.loserName ?? 'ツモ'}</td>
                  <td className="px-3 py-2">{y.isDealer ? '親' : '子'}</td>
                  {[0, 1, 2, 3].map((i) => (
                    <td key={i} className="px-3 py-2">
                      {y.yaku[i] ?? ''}
                    </td>
                  ))}
                  {loggedIn && (
                    <td className="px-2 py-2">
                      <button
                        onClick={() => {
                          if (confirm('この役満の記録を削除しますか？')) del.mutate(y.id);
                        }}
                        className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                      >
                        削除
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
