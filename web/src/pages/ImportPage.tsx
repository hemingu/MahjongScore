import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { computeGame, hasTie, validateGameScores, type Rule, type Seat } from '@mahjong/shared';
import { addGamesBulk, addPlayer, fetchPlayers } from '../api';
import { CSV_TEMPLATE, parseCsv } from '../csv';

interface ParsedRow {
  line: number;
  playedAt: string;
  rule: Rule;
  names: string[];
  scores: number[];
  kickerName: string;
  remarks: string;
  errors: string[];
}

function parseRows(text: string): ParsedRow[] {
  const rows = parseCsv(text);
  const dataRows = rows[0]?.[0] === '日付' ? rows.slice(1) : rows;
  return dataRows.map((cols, i) => {
    const [playedAt = '', rule = '', n1 = '', s1 = '', n2 = '', s2 = '', n3 = '', s3 = '', n4 = '', s4 = '', kickerName = '', remarks = ''] = cols;
    const names = [n1, n2, n3, n4];
    const scores = [s1, s2, s3, s4].map((s) => Number(s.replace(/,/g, '')));
    const errors: string[] = [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(playedAt)) errors.push('日付はYYYY-MM-DD形式で入力してください');
    if (rule !== '5-10' && rule !== '10-30') errors.push('ルールは 5-10 か 10-30 を指定してください');
    if (names.some((n) => !n)) errors.push('名前が4人分ありません');
    if (new Set(names).size !== 4) errors.push('同じ名前が重複しています');
    if (scores.some((s) => !Number.isFinite(s))) errors.push('点数が数値ではありません');
    else errors.push(...validateGameScores(scores));
    if (errors.length === 0 && hasTie(scores)) {
      if (!kickerName) errors.push('同点者がいるため起家名の指定が必要です');
      else if (!names.includes(kickerName)) errors.push(`起家名「${kickerName}」が4人の中にいません`);
    }
    return {
      line: i + 1,
      playedAt,
      rule: rule as Rule,
      names,
      scores,
      kickerName,
      remarks,
      errors,
    };
  });
}

export default function ImportPage() {
  const { data: players } = useQuery({ queryKey: ['players'], queryFn: fetchPlayers });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const parsed = useMemo(() => (text.trim() ? parseRows(text) : []), [text]);
  const hasErrors = parsed.some((r) => r.errors.length > 0);
  const knownNames = new Set(players?.map((p) => p.name) ?? []);
  const unknownNames = [...new Set(parsed.flatMap((r) => r.names))].filter(
    (n) => n && !knownNames.has(n),
  );

  const nameCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of parsed) {
      for (const n of r.names) {
        if (!n) continue;
        counts.set(n, (counts.get(n) ?? 0) + 1);
      }
    }
    return counts;
  }, [parsed]);
  const countValues = [...nameCounts.values()];
  const countMismatch = countValues.length > 0 && new Set(countValues).size > 1;
  const countMismatchMessage = countMismatch
    ? `メンバー間で試合数が一致しません: ${[...nameCounts.entries()].map(([n, c]) => `${n} ${c}回`).join(' / ')}`
    : '';

  const downloadTemplate = () => {
    const blob = new Blob(['﻿' + CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'mahjong-import-template.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const onImport = async () => {
    if (parsed.length === 0 || hasErrors || countMismatch) return;
    setBusy(true);
    setMessage('');
    try {
      // 未登録メンバーを先に作成
      const nameToId = new Map(players?.map((p) => [p.name, p.id]) ?? []);
      for (const name of unknownNames) {
        const created = await addPlayer(name);
        nameToId.set(created.name, created.id);
      }
      const games = parsed.map((r) => ({
        playedAt: r.playedAt,
        rule: r.rule,
        kickerSeat: r.kickerName ? (r.names.indexOf(r.kickerName) as Seat) : null,
        remarks: r.remarks,
        entries: r.names.map((name, seat) => ({
          playerId: nameToId.get(name)!,
          finalScore: r.scores[seat],
        })),
      }));
      await addGamesBulk(games);
      queryClient.invalidateQueries({ queryKey: ['games'] });
      queryClient.invalidateQueries({ queryKey: ['players'] });
      navigate('/games');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'インポートに失敗しました');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h2 className="text-xl font-bold">CSVインポート（過去のスコア）</h2>

      <section className="rounded-lg bg-white p-5 shadow">
        <p className="mb-2 text-sm text-gray-700">
          形式:{' '}
          <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">
            日付,ルール,名前1,点数1,名前2,点数2,名前3,点数3,名前4,点数4,起家名(同点時のみ),備考
          </code>
        </p>
        <button onClick={downloadTemplate} className="mb-4 text-sm text-emerald-700 underline">
          テンプレートCSVをダウンロード
        </button>
        <div className="mb-3">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setText(await f.text());
            }}
            className="block w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-emerald-700 file:px-4 file:py-2 file:text-white"
          />
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder="ここにCSVを貼り付けることもできます"
          className="w-full rounded border border-gray-300 px-3 py-2 font-mono text-xs"
        />
      </section>

      {parsed.length > 0 && (
        <section className="rounded-lg bg-white p-5 shadow">
          <h3 className="mb-3 font-semibold">プレビュー（{parsed.length}試合）</h3>
          {countMismatch && (
            <p className="mb-3 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
              {countMismatchMessage}
            </p>
          )}
          {unknownNames.length > 0 && (
            <p className="mb-3 rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800">
              未登録のメンバーが含まれています（インポート時に自動登録されます）: {unknownNames.join('、')}
            </p>
          )}
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-emerald-700 text-white">
                <tr>
                  <th className="px-2 py-1.5 text-left">行</th>
                  <th className="px-2 py-1.5 text-left">日付</th>
                  <th className="px-2 py-1.5 text-left">ルール</th>
                  <th className="px-2 py-1.5 text-left">結果（着順とポイント）</th>
                  <th className="px-2 py-1.5 text-left">備考</th>
                </tr>
              </thead>
              <tbody>
                {parsed.map((r) => (
                  <tr key={r.line} className={`border-t border-gray-100 ${r.errors.length > 0 ? 'bg-red-50' : ''}`}>
                    <td className="px-2 py-1.5">{r.line}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{r.playedAt}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{r.rule}</td>
                    <td className="px-2 py-1.5">
                      {r.errors.length > 0 ? (
                        <span className="text-red-600">{r.errors.join(' / ')}</span>
                      ) : (
                        computeGame(
                          r.scores,
                          r.rule,
                          r.kickerName ? (r.names.indexOf(r.kickerName) as Seat) : null,
                        )
                          .slice()
                          .sort((a, b) => a.rank - b.rank)
                          .map((c) => `${c.rank}位 ${r.names[c.seat]} ${(c.point > 0 ? '+' : '') + c.point.toFixed(1)}`)
                          .join(' / ')
                      )}
                    </td>
                    <td className="px-2 py-1.5">{r.remarks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {message && <p className="mt-3 text-sm whitespace-pre-line text-red-600">{message}</p>}
          <button
            onClick={onImport}
            disabled={busy || hasErrors || countMismatch || parsed.length === 0}
            className="mt-4 w-full rounded bg-emerald-700 py-2.5 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {busy
              ? 'インポート中…'
              : hasErrors || countMismatch
                ? 'エラーを修正してください'
                : `${parsed.length}試合をインポート`}
          </button>
        </section>
      )}
    </div>
  );
}
