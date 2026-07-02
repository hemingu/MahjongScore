import { Hono, type MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
import { sign, verify } from 'hono/jwt';
import {
  computeGame,
  hasTie,
  validateGameScores,
  type Game,
  type GameInput,
  type GameResult,
  type Seat,
  type Yakuman,
  type YakumanInput,
} from '@mahjong/shared';
import { analyzeScoreImage } from './analyze';

type Bindings = {
  DB: D1Database;
  GEMINI_API_KEY: string;
  AUTH_PASSWORD: string;
  SESSION_SECRET: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use(
  '/api/*',
  cors({
    origin: (origin) => {
      if (!origin) return origin;
      if (origin === 'https://hemingu.github.io') return origin;
      if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) return origin;
      return null;
    },
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
);

// ---- 認証 ----

const SESSION_DAYS = 90;

app.post('/api/login', async (c) => {
  const { password } = await c.req.json<{ password?: string }>();
  if (!password || password !== c.env.AUTH_PASSWORD) {
    return c.json({ error: 'パスワードが違います' }, 401);
  }
  const token = await sign(
    { exp: Math.floor(Date.now() / 1000) + SESSION_DAYS * 24 * 60 * 60 },
    c.env.SESSION_SECRET,
  );
  return c.json({ token });
});

const auth: MiddlewareHandler<{ Bindings: Bindings }> = async (c, next) => {
  const header = c.req.header('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) return c.json({ error: 'ログインが必要です' }, 401);
  try {
    await verify(token, c.env.SESSION_SECRET, 'HS256');
  } catch {
    return c.json({ error: 'セッションが無効です。再ログインしてください' }, 401);
  }
  await next();
};
// ---- プレイヤー ----

app.get('/api/players', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, name, display_order AS displayOrder, active, color FROM players ORDER BY display_order, id',
  ).all();
  return c.json(results.map((r) => ({ ...r, active: !!r.active })));
});

app.post('/api/players', auth, async (c) => {
  const { name } = await c.req.json<{ name?: string }>();
  const trimmed = name?.trim();
  if (!trimmed) return c.json({ error: '名前を入力してください' }, 400);
  try {
    const row = await c.env.DB.prepare(
      'INSERT INTO players (name, display_order) VALUES (?, (SELECT COALESCE(MAX(display_order), 0) + 1 FROM players)) RETURNING id, name, display_order AS displayOrder, active, color',
    )
      .bind(trimmed)
      .first();
    return c.json({ ...row!, active: true }, 201);
  } catch (e) {
    if (String(e).includes('UNIQUE')) return c.json({ error: '同名のメンバーが既に存在します' }, 409);
    throw e;
  }
});

app.patch('/api/players/:id', auth, async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return c.json({ error: '不正なIDです' }, 400);
  const { color } = await c.req.json<{ color?: string | null }>();
  if (color != null && !/^#[0-9a-fA-F]{6}$/.test(color)) {
    return c.json({ error: '色は #rrggbb 形式で指定してください' }, 400);
  }
  const row = await c.env.DB.prepare(
    'UPDATE players SET color = ? WHERE id = ? RETURNING id, name, display_order AS displayOrder, active, color',
  )
    .bind(color ?? null, id)
    .first();
  if (!row) return c.json({ error: 'メンバーが見つかりません' }, 404);
  return c.json({ ...row, active: !!row.active });
});

// ---- 試合 ----

interface ResultRow {
  gameId: number;
  playedAt: string;
  rule: '5-10' | '10-30';
  kickerSeat: number | null;
  remarks: string;
  createdAt: string;
  playerId: number;
  playerName: string;
  seat: number;
  finalScore: number;
  rank: number;
  point: number;
}

app.get('/api/games', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT g.id AS gameId, g.played_at AS playedAt, g.rule, g.kicker_seat AS kickerSeat,
            g.remarks, g.created_at AS createdAt,
            r.player_id AS playerId, p.name AS playerName, r.seat,
            r.final_score AS finalScore, r.rank, r.point
     FROM games g
     JOIN game_results r ON r.game_id = g.id
     JOIN players p ON p.id = r.player_id
     ORDER BY g.played_at DESC, g.id DESC, r.seat`,
  ).all<ResultRow>();

  const games = new Map<number, Game>();
  for (const row of results) {
    let game = games.get(row.gameId);
    if (!game) {
      game = {
        id: row.gameId,
        playedAt: row.playedAt,
        rule: row.rule,
        kickerSeat: (row.kickerSeat ?? null) as Seat | null,
        remarks: row.remarks,
        createdAt: row.createdAt,
        results: [],
      };
      games.set(row.gameId, game);
    }
    const result: GameResult = {
      playerId: row.playerId,
      playerName: row.playerName,
      seat: row.seat as Seat,
      finalScore: row.finalScore,
      rank: row.rank,
      point: row.point,
    };
    game.results.push(result);
  }
  return c.json([...games.values()]);
});

/** 入力を検証し、エラーメッセージ配列（空=OK）を返す */
function validateGameInput(input: GameInput): string[] {
  const errors: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.playedAt ?? '')) errors.push('日付の形式が不正です');
  if (input.rule !== '5-10' && input.rule !== '10-30') errors.push('順位点ルールが不正です');
  if (!Array.isArray(input.entries) || input.entries.length !== 4) {
    errors.push('4人分の記録が必要です');
    return errors;
  }
  const ids = input.entries.map((e) => e.playerId);
  if (new Set(ids).size !== 4) errors.push('同じメンバーが複数の席に指定されています');
  const scores = input.entries.map((e) => e.finalScore);
  errors.push(...validateGameScores(scores));
  if (hasTie(scores) && input.kickerSeat == null) errors.push('同点者がいるため起家の指定が必要です');
  return errors;
}

async function insertGame(db: D1Database, input: GameInput): Promise<number> {
  const scores = input.entries.map((e) => e.finalScore);
  const computed = computeGame(scores, input.rule, input.kickerSeat ?? null);
  const game = await db
    .prepare('INSERT INTO games (played_at, rule, kicker_seat, remarks) VALUES (?, ?, ?, ?) RETURNING id')
    .bind(input.playedAt, input.rule, input.kickerSeat ?? null, input.remarks ?? '')
    .first<{ id: number }>();
  const stmt = db.prepare(
    'INSERT INTO game_results (game_id, player_id, seat, final_score, rank, point) VALUES (?, ?, ?, ?, ?, ?)',
  );
  await db.batch(
    computed.map((r, seat) =>
      stmt.bind(game!.id, input.entries[seat].playerId, seat, r.finalScore, r.rank, r.point),
    ),
  );
  return game!.id;
}

app.post('/api/games', auth, async (c) => {
  const input = await c.req.json<GameInput>();
  const errors = validateGameInput(input);
  if (errors.length > 0) return c.json({ errors }, 400);
  const id = await insertGame(c.env.DB, input);
  return c.json({ id }, 201);
});

app.post('/api/games/bulk', auth, async (c) => {
  const { games } = await c.req.json<{ games: GameInput[] }>();
  if (!Array.isArray(games) || games.length === 0) {
    return c.json({ errors: ['インポートする試合がありません'] }, 400);
  }
  const allErrors = games.flatMap((g, i) => validateGameInput(g).map((e) => `${i + 1}行目: ${e}`));
  if (allErrors.length > 0) return c.json({ errors: allErrors }, 400);
  const ids: number[] = [];
  for (const g of games) {
    ids.push(await insertGame(c.env.DB, g));
  }
  return c.json({ ids }, 201);
});

app.delete('/api/games/:id', auth, async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return c.json({ error: '不正なIDです' }, 400);
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM yakuman WHERE game_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM game_results WHERE game_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM games WHERE id = ?').bind(id),
  ]);
  return c.json({ ok: true });
});

// ---- 役満記録 ----

interface YakumanRow {
  id: number;
  gameId: number;
  playedAt: string;
  winnerPlayerId: number;
  winnerName: string;
  loserPlayerId: number | null;
  loserName: string | null;
  isDealer: number;
  yaku1: string;
  yaku2: string | null;
  yaku3: string | null;
  yaku4: string | null;
}

app.get('/api/yakuman', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT y.id, y.game_id AS gameId, g.played_at AS playedAt,
            y.winner_player_id AS winnerPlayerId, wp.name AS winnerName,
            y.loser_player_id AS loserPlayerId, lp.name AS loserName,
            y.is_dealer AS isDealer,
            y.yaku1, y.yaku2, y.yaku3, y.yaku4
     FROM yakuman y
     JOIN games g ON g.id = y.game_id
     JOIN players wp ON wp.id = y.winner_player_id
     LEFT JOIN players lp ON lp.id = y.loser_player_id
     ORDER BY g.played_at DESC, y.id DESC`,
  ).all<YakumanRow>();

  const list: Yakuman[] = results.map((r) => ({
    id: r.id,
    gameId: r.gameId,
    playedAt: r.playedAt,
    winnerPlayerId: r.winnerPlayerId,
    winnerName: r.winnerName,
    loserPlayerId: r.loserPlayerId,
    loserName: r.loserName,
    isDealer: !!r.isDealer,
    yaku: [r.yaku1, r.yaku2, r.yaku3, r.yaku4].filter((y): y is string => !!y && y.trim() !== ''),
  }));
  return c.json(list);
});

/** 入力を検証し、エラーメッセージ配列（空=OK）を返す */
async function validateYakumanInput(db: D1Database, input: YakumanInput): Promise<string[]> {
  const errors: string[] = [];

  const gameId = Number(input.gameId);
  if (!Number.isInteger(gameId)) errors.push('試合IDが不正です');

  const game = Number.isInteger(gameId)
    ? await db.prepare('SELECT id FROM games WHERE id = ?').bind(gameId).first<{ id: number }>()
    : null;
  if (!game) errors.push('指定された試合が存在しません');

  const rawYaku = input.yaku;
  const trimmed = Array.isArray(rawYaku) ? rawYaku.map((y) => (y ?? '').trim()).filter((y) => y !== '') : [];
  if (!Array.isArray(rawYaku) || trimmed.length < 1 || trimmed.length > 4) {
    errors.push('役満は1〜4件で指定してください');
  }

  if (input.winnerPlayerId == null || !Number.isInteger(Number(input.winnerPlayerId))) {
    errors.push('和了者を指定してください');
  }
  if (input.loserPlayerId != null && input.winnerPlayerId === input.loserPlayerId) {
    errors.push('和了者と放銃者が同じです');
  }
  if (typeof input.isDealer !== 'boolean') errors.push('親子の指定が不正です');

  if (game) {
    const participants = await db
      .prepare('SELECT player_id AS playerId FROM game_results WHERE game_id = ?')
      .bind(gameId)
      .all<{ playerId: number }>();
    const ids = new Set(participants.results.map((p) => p.playerId));
    if (Number.isInteger(Number(input.winnerPlayerId)) && !ids.has(input.winnerPlayerId)) {
      errors.push('和了者がその試合の参加者ではありません');
    }
    if (input.loserPlayerId != null && !ids.has(input.loserPlayerId)) {
      errors.push('放銃者がその試合の参加者ではありません');
    }
  }

  return errors;
}

app.post('/api/yakuman', auth, async (c) => {
  const input = await c.req.json<YakumanInput>();
  const errors = await validateYakumanInput(c.env.DB, input);
  if (errors.length > 0) return c.json({ errors }, 400);

  const trimmedYaku = input.yaku.map((y) => y.trim()).filter((y) => y !== '');
  const row = await c.env.DB.prepare(
    `INSERT INTO yakuman (game_id, winner_player_id, loser_player_id, is_dealer, yaku1, yaku2, yaku3, yaku4)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  )
    .bind(
      input.gameId,
      input.winnerPlayerId,
      input.loserPlayerId ?? null,
      input.isDealer ? 1 : 0,
      trimmedYaku[0],
      trimmedYaku[1] ?? null,
      trimmedYaku[2] ?? null,
      trimmedYaku[3] ?? null,
    )
    .first<{ id: number }>();
  return c.json({ id: row!.id }, 201);
});

app.delete('/api/yakuman/:id', auth, async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return c.json({ error: '不正なIDです' }, 400);
  await c.env.DB.prepare('DELETE FROM yakuman WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// ---- 画像解析 ----

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;

app.post('/api/analyze', auth, async (c) => {
  const { image, mediaType } = await c.req.json<{ image?: string; mediaType?: string }>();
  if (!image || !mediaType || !(IMAGE_TYPES as readonly string[]).includes(mediaType)) {
    return c.json({ error: '画像データが不正です' }, 400);
  }
  try {
    const result = await analyzeScoreImage(c.env.GEMINI_API_KEY, image, mediaType);
    return c.json(result);
  } catch (e) {
    console.error('analyze failed:', e);
    return c.json({ error: e instanceof Error ? e.message : '画像解析に失敗しました' }, 502);
  }
});

export default app;
