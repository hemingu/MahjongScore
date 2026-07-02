import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { login } from '../api';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(password);
      navigate('/record');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ログインに失敗しました');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-sm">
      <h2 className="mb-4 text-xl font-bold">記録者ログイン</h2>
      <form onSubmit={onSubmit} className="space-y-4 rounded-lg bg-white p-6 shadow">
        <div>
          <label className="mb-1 block text-sm font-medium">パスワード</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2"
            autoFocus
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy || !password}
          className="w-full rounded bg-emerald-700 py-2 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          ログイン
        </button>
        <p className="text-xs text-gray-500">閲覧だけならログインは不要です。</p>
      </form>
    </div>
  );
}
