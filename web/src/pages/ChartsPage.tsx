import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchGames, fetchPlayers } from '../api';
import { useYearFilter } from '../useYearFilter';
import YearSelect from '../components/YearSelect';
import { seriesColor } from '../chartColors';

const RANK_COLORS = ['#2a78d6', '#1baf7a', '#eda100', '#e34948'];
const MUTED = '#898781';
const GRID = '#e1e0d9';
const BASELINE = '#c3c2b7';

interface RankDatum {
  name: string;
  [rank: string]: number | string;
}

export default function ChartsPage() {
  const { data: games, isLoading, error } = useQuery({ queryKey: ['games'], queryFn: fetchGames });
  const { data: players } = useQuery({ queryKey: ['players'], queryFn: fetchPlayers });
  const { year, setYear, years, filteredGames } = useYearFilter(games);

  // 系列の並びと色はメンバーリスト（display_order）基準で固定する。
  // 試合データの登場順に依存させると、記録追加のたびにデフォルト色の割当がずれる。
  const playerOrder = useMemo(() => {
    const inGames = new Set<number>();
    for (const g of filteredGames) {
      for (const r of g.results) inGames.add(r.playerId);
    }
    if (players && players.length > 0) {
      return players
        .map((p, idx) => ({ id: p.id, name: p.name, color: seriesColor(p.color, idx) }))
        .filter((p) => inGames.has(p.id));
    }
    // メンバー一覧の取得前は試合データの出現順でフォールバック
    const seen = new Map<number, string>();
    for (const g of filteredGames) {
      for (const r of g.results) {
        if (!seen.has(r.playerId)) seen.set(r.playerId, r.playerName);
      }
    }
    return [...seen.entries()].map(([id, name], idx) => ({ id, name, color: seriesColor(null, idx) }));
  }, [players, filteredGames]);

  const rankData: RankDatum[] = useMemo(() => {
    const map = new Map<number, RankDatum & { name: string }>();
    for (const { id, name } of playerOrder) {
      map.set(id, { name, '1位': 0, '2位': 0, '3位': 0, '4位': 0 });
    }
    for (const g of filteredGames) {
      for (const r of g.results) {
        const d = map.get(r.playerId);
        if (d) d[`${r.rank}位`] = (d[`${r.rank}位`] as number) + 1;
      }
    }
    return [...map.values()];
  }, [filteredGames, playerOrder]);

  const pointTrend = useMemo(() => {
    const sorted = [...filteredGames].sort((a, b) => {
      if (a.playedAt !== b.playedAt) return a.playedAt < b.playedAt ? -1 : 1;
      return a.id - b.id;
    });
    const totals = new Map<number, number>();
    for (const { id } of playerOrder) totals.set(id, 0);
    const data: Record<string, number>[] = [];
    sorted.forEach((g, idx) => {
      for (const r of g.results) {
        totals.set(r.playerId, (totals.get(r.playerId) ?? 0) + r.point);
      }
      const point: Record<string, number> = { gameNo: idx + 1 };
      for (const { id, name } of playerOrder) {
        point[name] = Math.round((totals.get(id) ?? 0) * 10) / 10;
      }
      data.push(point);
    });
    return data;
  }, [filteredGames, playerOrder]);

  if (isLoading) return <p className="text-gray-500">読み込み中…</p>;
  if (error) return <p className="text-red-600">読み込みに失敗しました: {String(error)}</p>;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <h2 className="text-xl font-bold">集計グラフ</h2>
        <YearSelect year={year} years={years} onChange={setYear} />
      </div>

      {filteredGames.length === 0 ? (
        <p className="text-gray-500">記録がありません。</p>
      ) : (
        <div className="space-y-6">
          <section className="rounded-lg bg-white p-5 shadow">
            <h3 className="mb-3 font-semibold">人別着順分布</h3>
            <ResponsiveContainer width="100%" height={Math.max(200, rankData.length * 56)}>
              <BarChart data={rankData} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                <CartesianGrid stroke={GRID} horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fill: MUTED, fontSize: 12 }} stroke={BASELINE} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={88}
                  tick={{ fill: MUTED, fontSize: 12 }}
                  stroke={BASELINE}
                />
                <Tooltip
                  contentStyle={{ fontSize: 13, borderRadius: 8, border: '1px solid #e1e0d9' }}
                  cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {['1位', '2位', '3位', '4位'].map((rank, idx) => (
                  <Bar
                    key={rank}
                    dataKey={rank}
                    stackId="rank"
                    fill={RANK_COLORS[idx]}
                    radius={idx === 3 ? [0, 4, 4, 0] : idx === 0 ? [4, 0, 0, 4] : 0}
                    maxBarSize={24}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </section>

          <section className="rounded-lg bg-white p-5 shadow">
            <h3 className="mb-3 font-semibold">ポイント推移</h3>
            <ResponsiveContainer width="100%" height={360}>
              <LineChart data={pointTrend} margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis
                  dataKey="gameNo"
                  tick={{ fill: MUTED, fontSize: 12 }}
                  stroke={BASELINE}
                  label={{ value: '通算試合数', position: 'insideBottom', offset: -4, fill: MUTED, fontSize: 12 }}
                />
                <YAxis tick={{ fill: MUTED, fontSize: 12 }} stroke={BASELINE} />
                <ReferenceLine y={0} stroke={BASELINE} strokeWidth={1} />
                <Tooltip
                  contentStyle={{ fontSize: 13, borderRadius: 8, border: '1px solid #e1e0d9' }}
                  labelFormatter={(v) => `第${v}試合`}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                {playerOrder.map(({ name, color }) => (
                  <Line
                    key={name}
                    type="linear"
                    dataKey={name}
                    stroke={color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: '#fcfcfb' }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </section>
        </div>
      )}
    </div>
  );
}
