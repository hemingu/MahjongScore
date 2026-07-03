import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { addPlayer, fetchPlayers, setToken, testDiscordNotify, updatePlayerColor } from '../api';
import { seriesColor } from '../chartColors';

export default function SettingsPage() {
  const { data: players } = useQuery({ queryKey: ['players'], queryFn: fetchPlayers });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const setColor = useMutation({
    mutationFn: ({ id, color }: { id: number; color: string | null }) => updatePlayerColor(id, color),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['players'] }),
    onError: (e) => setError(e instanceof Error ? e.message : '色の保存に失敗しました'),
  });

  const add = useMutation({
    mutationFn: addPlayer,
    onSuccess: () => {
      setName('');
      setError('');
      queryClient.invalidateQueries({ queryKey: ['players'] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : '追加に失敗しました'),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) add.mutate(name.trim());
  };

  const discordTest = useMutation({ mutationFn: testDiscordNotify });

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h2 className="text-xl font-bold">設定</h2>

      <section className="rounded-lg bg-white p-5 shadow">
        <h3 className="mb-3 font-semibold">メンバー</h3>
        <p className="mb-2 text-xs text-gray-500">色はグラフ（ポイント推移）の線色に使われます。</p>
        <ul className="mb-4 divide-y divide-gray-100">
          {players?.map((p, idx) => (
            <li key={p.id} className="flex items-center gap-3 py-2 text-sm">
              <input
                type="color"
                defaultValue={seriesColor(p.color, idx)}
                onBlur={(e) => {
                  if (e.target.value !== seriesColor(p.color, idx)) {
                    setColor.mutate({ id: p.id, color: e.target.value });
                  }
                }}
                className="h-7 w-9 cursor-pointer rounded border border-gray-300"
                title="グラフの線色"
              />
              <span className="flex-1">{p.name}</span>
              {p.color && (
                <button
                  onClick={() => setColor.mutate({ id: p.id, color: null })}
                  className="text-xs text-gray-500 hover:underline"
                >
                  色をリセット
                </button>
              )}
            </li>
          ))}
          {players?.length === 0 && <li className="py-2 text-sm text-gray-500">メンバーがいません</li>}
        </ul>
        <form onSubmit={onSubmit} className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="名前"
            className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={!name.trim() || add.isPending}
            className="rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            追加
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </section>

      <section className="rounded-lg bg-white p-5 shadow">
        <h3 className="mb-3 font-semibold">通知</h3>
        <p className="mb-3 text-xs text-gray-500">
          Gemini APIの無料枠超過時にDiscordへ通知します。テスト送信で設定を確認できます。
        </p>
        <button
          onClick={() => discordTest.mutate()}
          disabled={discordTest.isPending}
          className="rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {discordTest.isPending ? '送信中…' : 'Discord通知をテスト送信'}
        </button>
        {discordTest.isSuccess && (
          <p className="mt-2 text-sm text-emerald-700">テスト通知を送信しました。Discordを確認してください</p>
        )}
        {discordTest.isError && (
          <p className="mt-2 text-sm text-red-600">
            {discordTest.error instanceof Error ? discordTest.error.message : 'テスト送信に失敗しました'}
          </p>
        )}
      </section>

      <section className="rounded-lg bg-white p-5 shadow">
        <button
          onClick={() => {
            setToken(null);
            navigate('/');
          }}
          className="w-full rounded border border-red-300 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
        >
          ログアウト
        </button>
      </section>
    </div>
  );
}
