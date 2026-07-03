import type { AnalyzeResult, Game, GameInput, Player, Yakuman, YakumanInput } from '@mahjong/shared';

export const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787';

const TOKEN_KEY = 'mahjong-auth-token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new Event('auth-changed'));
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}, withAuth = false): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (withAuth) {
    const token = getToken();
    if (!token) throw new ApiError(401, 'ログインが必要です');
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && withAuth) setToken(null);
    const b = body as { error?: string; errors?: string[] };
    throw new ApiError(res.status, b.errors?.join('\n') ?? b.error ?? `エラー (${res.status})`);
  }
  return body as T;
}

export async function login(password: string): Promise<void> {
  const { token } = await request<{ token: string }>('/api/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
  setToken(token);
}

export const fetchPlayers = () => request<Player[]>('/api/players');
export const fetchGames = () => request<Game[]>('/api/games');

export const addPlayer = (name: string) =>
  request<Player>('/api/players', { method: 'POST', body: JSON.stringify({ name }) }, true);

export const addGame = (input: GameInput) =>
  request<{ id: number }>('/api/games', { method: 'POST', body: JSON.stringify(input) }, true);

export const addGamesBulk = (games: GameInput[]) =>
  request<{ ids: number[] }>('/api/games/bulk', { method: 'POST', body: JSON.stringify({ games }) }, true);

export const deleteGame = (id: number) =>
  request<{ ok: boolean }>(`/api/games/${id}`, { method: 'DELETE' }, true);

export const analyzeImage = (image: string, mediaType: string) =>
  request<AnalyzeResult>('/api/analyze', { method: 'POST', body: JSON.stringify({ image, mediaType }) }, true);

export const updatePlayerColor = (id: number, color: string | null) =>
  request<Player>(`/api/players/${id}`, { method: 'PATCH', body: JSON.stringify({ color }) }, true);

export const testDiscordNotify = () =>
  request<{ ok: boolean }>('/api/discord/test', { method: 'POST' }, true);

export const fetchYakuman = () => request<Yakuman[]>('/api/yakuman');

export const addYakuman = (input: YakumanInput) =>
  request<{ id: number }>('/api/yakuman', { method: 'POST', body: JSON.stringify(input) }, true);

export const deleteYakuman = (id: number) =>
  request<{ ok: boolean }>(`/api/yakuman/${id}`, { method: 'DELETE' }, true);
