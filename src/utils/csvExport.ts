// Client-side CSV export shared by Finance/Campaigns — no server round
// trip, no library dependency. The admin is exporting data already
// loaded and visible on their own screen; this only formats it.

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

function escapeCsvCell(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  // Quote whenever the cell could otherwise be misread: a comma, a
  // quote (doubled per RFC 4180), or a newline.
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCsvCell(c.header)).join(",");
  const lines = rows.map((row) => columns.map((c) => escapeCsvCell(c.value(row))).join(","));
  // Leading BOM so Excel (still the most likely opener for a lab
  // office) renders ₹ and other non-ASCII text correctly instead of as
  // mojibake.
  return `﻿${[header, ...lines].join("\r\n")}`;
}

export function downloadCsv<T>(filename: string, rows: T[], columns: CsvColumn<T>[]): void {
  const csv = toCsv(rows, columns);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
