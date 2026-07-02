/** ダブルクォート対応の簡易CSVパーサ。空行は除外して行×列の配列を返す */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/\r\n?/g, '\n');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row.map((f) => f.trim()));
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row.map((f) => f.trim()));
  return rows;
}

export const CSV_HEADER =
  '日付,ルール,名前1,点数1,名前2,点数2,名前3,点数3,名前4,点数4,起家名(同点時のみ),備考';

export const CSV_TEMPLATE = `${CSV_HEADER}
2026-07-01,5-10,太郎,45000,次郎,30000,三郎,15000,四郎,10000,,例: 役満（国士無双）
2026-07-01,10-30,太郎,40000,次郎,25000,三郎,25000,四郎,10000,次郎,同点のため起家を指定
`;
