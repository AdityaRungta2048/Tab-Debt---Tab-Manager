/**
 * CSV serialisation. Pure, and deliberately paranoid in two places.
 *
 * 1. Quoting: a field containing a comma, quote, newline or carriage return is quoted and
 *    its quotes doubled, per RFC 4180. Tab titles routinely contain commas and quotes.
 * 2. Formula injection: a field beginning `=`, `+`, `-`, `@`, tab or CR is prefixed with a
 *    single quote. Spreadsheet software treats those as formulas, so a page titled
 *    `=HYPERLINK("http://evil","click")` becomes live content in the user's spreadsheet.
 *    Tab titles are attacker-controlled — any page can set one — so this is a real vector,
 *    not a theoretical one.
 */

const NEEDS_QUOTING = /[",\n\r]/;
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function escapeCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;
  if (NEEDS_QUOTING.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export type CsvColumn<T> = { header: string; value: (row: T) => unknown };

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [columns.map((c) => escapeCell(c.header)).join(',')];
  for (const row of rows) {
    lines.push(columns.map((c) => escapeCell(c.value(row))).join(','));
  }
  // CRLF per RFC 4180; Excel is happier and every other tool tolerates it.
  return lines.join('\r\n');
}

/** Suggested filename. Dated so repeated exports do not overwrite one another. */
export function csvFilename(kind: string, now = new Date()): string {
  return `tab-debt-${kind}-${now.toISOString().slice(0, 10)}.csv`;
}
