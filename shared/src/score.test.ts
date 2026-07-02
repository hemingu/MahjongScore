import { describe, expect, it } from 'vitest';
import { computeGame, computePoint, computeRanks, hasTie, validateGameScores } from './score';

describe('computeRanks', () => {
  it('点数降順に着順を付ける', () => {
    // 下=45000, 右=30000, 上=15000, 左=10000
    expect(computeRanks([45000, 30000, 15000, 10000])).toEqual([1, 2, 3, 4]);
    expect(computeRanks([10000, 15000, 30000, 45000])).toEqual([4, 3, 2, 1]);
  });

  it('同点は起家に近い席が上位（起家=東→南→西→北 = 下→右→上→左）', () => {
    // 右と上が同点25000、起家=上(2) → 席順は 上→左→下→右 なので上が上位
    const ranks = computeRanks([40000, 25000, 25000, 10000], 2);
    expect(ranks).toEqual([1, 3, 2, 4]);
    // 起家=下(0) なら 右が先
    const ranks2 = computeRanks([40000, 25000, 25000, 10000], 0);
    expect(ranks2).toEqual([1, 2, 3, 4]);
  });

  it('全員同点なら起家からの席順そのまま', () => {
    expect(computeRanks([25000, 25000, 25000, 25000], 1)).toEqual([4, 1, 2, 3]);
  });

  it('同点があるのに起家未指定ならエラー', () => {
    expect(() => computeRanks([40000, 25000, 25000, 10000])).toThrow('起家');
  });
});

describe('computePoint', () => {
  it('5-10: 1位はオカ+20込み', () => {
    // (45000-30000)/1000 + 10 + 20 = 45
    expect(computePoint(45000, 1, '5-10')).toBe(45);
    expect(computePoint(30000, 2, '5-10')).toBe(5);
    expect(computePoint(15000, 3, '5-10')).toBe(-20);
    expect(computePoint(10000, 4, '5-10')).toBe(-30);
  });

  it('10-30', () => {
    expect(computePoint(45000, 1, '10-30')).toBe(65);
    expect(computePoint(30000, 2, '10-30')).toBe(10);
    expect(computePoint(15000, 3, '10-30')).toBe(-25);
    expect(computePoint(10000, 4, '10-30')).toBe(-50);
  });

  it('100点単位は小数第1位', () => {
    expect(computePoint(24500, 3, '5-10')).toBe(-10.5);
  });
});

describe('computeGame', () => {
  it.each(['5-10', '10-30'] as const)('%s: 4人のポイント合計は0', (rule) => {
    const results = computeGame([45000, 30000, 15000, 10000], rule);
    const sum = results.reduce((a, r) => a + r.point, 0);
    expect(sum).toBeCloseTo(0, 10);
  });

  it('同点ありでも合計0', () => {
    const results = computeGame([40000, 25000, 25000, 10000], '10-30', 2);
    expect(results.reduce((a, r) => a + r.point, 0)).toBeCloseTo(0, 10);
    expect(results.map((r) => r.rank)).toEqual([1, 3, 2, 4]);
  });
});

describe('validateGameScores / hasTie', () => {
  it('合計が100000でないとエラー', () => {
    expect(validateGameScores([45000, 30000, 15000, 10000])).toEqual([]);
    expect(validateGameScores([45000, 30000, 15000, 9000]).length).toBeGreaterThan(0);
  });

  it('整数以外はエラー', () => {
    expect(validateGameScores([45000.5, 30000, 15000, 9999.5]).length).toBeGreaterThan(0);
  });

  it('hasTie', () => {
    expect(hasTie([1, 2, 3, 4])).toBe(false);
    expect(hasTie([1, 2, 2, 4])).toBe(true);
  });
});
