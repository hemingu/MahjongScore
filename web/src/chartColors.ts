// dataviz スキルの categorical パレット（固定順・CVD検証済み）
export const SERIES_COLORS = [
  '#2a78d6', // blue
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#008300', // green
  '#4a3aa7', // violet
  '#e34948', // red
  '#e87ba4', // magenta
  '#eb6834', // orange
];

/** プレイヤーの設定色（なければデフォルトパレットの idx 番目）を返す */
export function seriesColor(customColor: string | null | undefined, idx: number): string {
  return customColor ?? SERIES_COLORS[idx % SERIES_COLORS.length];
}
