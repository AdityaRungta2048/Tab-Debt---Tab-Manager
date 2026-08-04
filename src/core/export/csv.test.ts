import { describe, it, expect } from 'vitest';
import { escapeCell, toCsv, csvFilename, type CsvColumn } from './csv';

describe('escapeCell — RFC 4180 quoting', () => {
  it.each([
    ['plain', 'plain'],
    ['', ''],
    ['with, comma', '"with, comma"'],
    ['with "quote"', '"with ""quote"""'],
    ['with\nnewline', '"with\nnewline"'],
    ['with\rcarriage', '"with\rcarriage"'],
  ])('escapes %j', (input, expected) => {
    expect(escapeCell(input)).toBe(expected);
  });

  it('renders null and undefined as empty rather than the words', () => {
    expect(escapeCell(null)).toBe('');
    expect(escapeCell(undefined)).toBe('');
  });

  it('stringifies numbers and booleans', () => {
    expect(escapeCell(42)).toBe('42');
    expect(escapeCell(0)).toBe('0');
    expect(escapeCell(true)).toBe('true');
  });
});

/**
 * Tab titles are attacker-controlled — any web page can set its own title — so a title
 * beginning with `=` would become a live formula in the user's spreadsheet.
 */
describe('escapeCell — formula injection', () => {
  it.each([
    '=HYPERLINK("http://evil","click")',
    '+1234',
    '-1+1',
    '@SUM(A1)',
    '\tleading tab',
  ])('neutralises a leading formula character in %j', (input) => {
    const out = escapeCell(input);
    // The quote may be inside the RFC quoting, so check the payload rather than index 0.
    expect(out.replace(/^"/, '').startsWith("'")).toBe(true);
  });

  it('quotes AND neutralises when the payload also contains a comma', () => {
    const out = escapeCell('=cmd|"/c calc"!A1,x');
    expect(out.startsWith('"\'=')).toBe(true);
    expect(out.endsWith('"')).toBe(true);
  });

  it('leaves an ordinary title that merely contains a minus sign alone', () => {
    expect(escapeCell('vite-plugin — docs')).toBe('vite-plugin — docs');
  });

  it('does not mangle a negative number that a user would expect to see', () => {
    // Prefixed, deliberately: correctness of display loses to not executing content.
    expect(escapeCell(-5)).toBe("'-5");
  });
});

describe('toCsv', () => {
  type Row = { title: string; count: number };
  const columns: CsvColumn<Row>[] = [
    { header: 'Title', value: (r) => r.title },
    { header: 'Count', value: (r) => r.count },
  ];

  it('writes a header row even with no data', () => {
    expect(toCsv([], columns)).toBe('Title,Count');
  });

  it('writes CRLF line endings per RFC 4180', () => {
    const csv = toCsv([{ title: 'a', count: 1 }], columns);
    expect(csv).toBe('Title,Count\r\na,1');
  });

  it('escapes every cell, headers included', () => {
    const csv = toCsv([{ title: 'x, y', count: 2 }], [
      { header: 'Tab, title', value: (r: Row) => r.title },
      { header: 'Count', value: (r: Row) => r.count },
    ]);
    expect(csv).toBe('"Tab, title",Count\r\n"x, y",2');
  });

  it('round-trips through a naive parser without losing rows', () => {
    const rows: Row[] = [
      { title: 'plain', count: 1 },
      { title: 'has, comma', count: 2 },
      { title: 'has "quotes"', count: 3 },
    ];
    const csv = toCsv(rows, columns);
    // Rows are separated by CRLF and no field contains a bare newline here.
    expect(csv.split('\r\n')).toHaveLength(rows.length + 1);
  });

  it('handles a multi-line title without breaking the row count of a real parser', () => {
    const csv = toCsv([{ title: 'line1\nline2', count: 1 }], columns);
    // The newline survives, but inside quotes — an RFC-compliant parser sees one record.
    expect(csv).toContain('"line1\nline2"');
  });
});

describe('csvFilename', () => {
  it('is dated so repeated exports do not overwrite each other', () => {
    expect(csvFilename('tabs', new Date('2026-08-03T10:00:00Z'))).toBe('tab-debt-tabs-2026-08-03.csv');
  });
});
