/** 順位点ルール */
export type Rule = '5-10' | '10-30';

/** 席: 0=下(自分), 1=右, 2=上, 3=左 — 撮影画像内の点数表示の並びと同じ */
export type Seat = 0 | 1 | 2 | 3;

export const SEAT_LABELS = ['下（自分）', '右', '上', '左'] as const;

export interface Player {
  id: number;
  name: string;
  displayOrder: number;
  active: boolean;
  /** グラフ表示色 #rrggbb（null=デフォルトパレット） */
  color: string | null;
}

/** 1試合1人分の結果 */
export interface GameResult {
  playerId: number;
  playerName: string;
  seat: Seat;
  finalScore: number;
  rank: number;
  point: number;
}

export interface Game {
  id: number;
  playedAt: string; // YYYY-MM-DD
  rule: Rule;
  kickerSeat: Seat | null; // 起家の席（同点があった試合のみ）
  remarks: string;
  createdAt: string;
  results: GameResult[];
}

/** 試合登録リクエスト */
export interface GameInput {
  playedAt: string;
  rule: Rule;
  kickerSeat?: Seat | null;
  remarks?: string;
  /** 席順 (下,右,上,左) の4要素 */
  entries: { playerId: number; finalScore: number }[];
}

/** 画像解析結果: 下・右・上・左の点数 */
export interface AnalyzeResult {
  bottom: number;
  right: number;
  top: number;
  left: number;
}

/** 役満記録 */
export interface Yakuman {
  id: number;
  gameId: number;
  playedAt: string;
  winnerPlayerId: number;
  winnerName: string;
  loserPlayerId: number | null; // null = ツモ
  loserName: string | null;
  isDealer: boolean; // true=親
  yaku: string[];    // 1〜4件
}

/** 役満登録リクエスト */
export interface YakumanInput {
  gameId: number;
  winnerPlayerId: number;
  loserPlayerId?: number | null;
  isDealer: boolean;
  yaku: string[];
}
