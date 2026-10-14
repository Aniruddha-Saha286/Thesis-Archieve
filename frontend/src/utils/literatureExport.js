export const MATRIX_COLUMNS = [
  ['title', 'Paper'], ['authors', 'Authors'], ['year', 'Year'], ['doi', 'DOI'], ['source', 'Source link'],
  ['objective', 'Objective'], ['methodology', 'Methodology'], ['dataset', 'Dataset / sample'],
  ['findings', 'Findings / reported metrics'], ['limitations', 'Author-stated limitations'], ['futureWork', 'Future work'],
  ['relevance', 'Relevance to my thesis'], ['notes', 'Personal notes'], ['coverage', 'Analysis coverage'],
  ['analysisType', 'Analysis type'], ['evidence', 'Supporting evidence'], ['provenance', 'Field provenance'],
];
export function csvCell(value) {
  let text = String(value ?? '');
  // Spreadsheet applications interpret untrusted leading characters as formulas.
  // eslint-disable-next-line no-control-regex -- Covers spreadsheet formula injection after control characters.
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function matrixCsv(rows) {
  return '\uFEFF' + [MATRIX_COLUMNS.map(([, label]) => csvCell(label)).join(','),
    ...rows.map(row => MATRIX_COLUMNS.map(([key]) => csvCell(row[key])).join(','))].join('\r\n');
}
export function matrixMarkdown(rows) {
  const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('|', '\\|').replace(/\r?\n/g, '<br>');
  return [ '| ' + MATRIX_COLUMNS.map(([, label]) => label).join(' | ') + ' |',
    '| ' + MATRIX_COLUMNS.map(() => '---').join(' | ') + ' |',
    ...rows.map(row => '| ' + MATRIX_COLUMNS.map(([key]) => escape(row[key])).join(' | ') + ' |'),
    '', 'Verify evidence against the original paper. “Not extracted” means information is missing, not that it does not exist.' ].join('\n');
}
export async function matrixExcel(rows) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'The Thesis Archive';
  const sheet = workbook.addWorksheet('Literature Review', { views: [{ state: 'frozen', ySplit: 1, xSplit: 1 }] });
  sheet.columns = MATRIX_COLUMNS.map(([key, header], i) => ({ key, header, width: i === 2 ? 9 : i < 5 ? 32 : 48 }));
  rows.forEach(row => sheet.addRow(Object.fromEntries(MATRIX_COLUMNS.map(([key]) => [key, String(row[key] ?? '')]))));
  sheet.autoFilter = { from: 'A1', to: { row: rows.length + 1, column: MATRIX_COLUMNS.length } };
  sheet.eachRow((row, number) => {
    row.alignment = { vertical: 'top', wrapText: true };
    row.height = number === 1 ? 30 : 100;
    if (number === 1) { row.font = { bold: true, color: { argb: 'FFFFFFFF' } }; row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF254B40' } }; }
  });
  return workbook.xlsx.writeBuffer();
}
export function downloadFile(data, filename, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
