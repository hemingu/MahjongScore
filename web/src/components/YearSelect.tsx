interface YearSelectProps {
  year: string;
  years: string[];
  onChange: (year: string) => void;
}

/** 年別/全期間の切り替えセレクト（StatsPage・ChartsPageで共用）。全期間は一番下 */
export default function YearSelect({ year, years, onChange }: YearSelectProps) {
  return (
    <select
      value={year}
      onChange={(e) => onChange(e.target.value)}
      className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
    >
      {years.map((y) => (
        <option key={y} value={y}>
          {y}年
        </option>
      ))}
      <option value="all">全期間</option>
    </select>
  );
}
