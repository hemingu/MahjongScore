import type { Rule, Seat } from './types';

/** 順位点（点数単位）。インデックスは着順-1 */
export const RANK_POINTS: Record<Rule, readonly [number, number, number, number]> = {
  '5-10': [10000, 5000, -5000, -10000],
  '10-30': [30000, 10000, -10000, -30000],
};

/** オカ: 25000点持ち30000点返し → トップ賞 20000点 */
export const OKA_POINTS = 20000;
export const RETURN_SCORE = 30000;
export const TOTAL_SCORE = 100000;

/** 4人の点数に同点があるか（着順決定に起家が必要か） */
export function hasTie(finalScores: readonly number[]): boolean {
  return new Set(finalScores).size !== finalScores.length;
}

/**
 * 席ごとの着順 (1-4) を返す。
 * 同点は起家に近い席が上位: 起家=東として 下→右→上→左 の並びが東→南→西→北。
 * 同点があるのに kickerSeat 未指定ならエラー。
 */
export function computeRanks(finalScores: readonly number[], kickerSeat?: Seat | null): number[] {
  if (finalScores.length !== 4) throw new Error('4人分の点数が必要です');
  if (hasTie(finalScores) && kickerSeat == null) {
    throw new Error('同点者がいるため起家の指定が必要です');
  }
  const kicker = kickerSeat ?? 0;
  const seats = [0, 1, 2, 3].slice();
  seats.sort((a, b) => {
    if (finalScores[a] !== finalScores[b]) return finalScores[b] - finalScores[a];
    return ((a - kicker + 4) % 4) - ((b - kicker + 4) % 4);
  });
  const ranks = new Array<number>(4);
  seats.forEach((seat, i) => {
    ranks[seat] = i + 1;
  });
  return ranks;
}

/**
 * ポイント = (終了時点数 − 30000)/1000 + 順位点/1000 + (1位のみ +20)
 * 小数第1位までに丸める（100点単位入力なら誤差なし）
 */
export function computePoint(finalScore: number, rank: number, rule: Rule): number {
  const raw = (finalScore - RETURN_SCORE + RANK_POINTS[rule][rank - 1] + (rank === 1 ? OKA_POINTS : 0)) / 1000;
  return Math.round(raw * 10) / 10;
}

export interface ComputedResult {
  seat: Seat;
  finalScore: number;
  rank: number;
  point: number;
}

/** 4人分の点数から着順とポイントを一括計算 */
export function computeGame(
  finalScores: readonly number[],
  rule: Rule,
  kickerSeat?: Seat | null,
): ComputedResult[] {
  const ranks = computeRanks(finalScores, kickerSeat);
  return finalScores.map((finalScore, seat) => ({
    seat: seat as Seat,
    finalScore,
    rank: ranks[seat],
    point: computePoint(finalScore, ranks[seat], rule),
  }));
}

/** 入力検証。問題があればエラーメッセージ配列を返す（空配列 = OK） */
export function validateGameScores(finalScores: readonly number[]): string[] {
  const errors: string[] = [];
  if (finalScores.length !== 4) {
    errors.push('4人分の点数が必要です');
    return errors;
  }
  if (finalScores.some((s) => !Number.isInteger(s))) {
    errors.push('点数は整数で入力してください');
  }
  const sum = finalScores.reduce((a, b) => a + b, 0);
  if (sum !== TOTAL_SCORE) {
    errors.push(`点数の合計が${TOTAL_SCORE.toLocaleString()}点ではありません（現在: ${sum.toLocaleString()}点）`);
  }
  return errors;
}
