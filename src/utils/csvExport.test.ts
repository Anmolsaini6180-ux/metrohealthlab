import { describe, expect, it } from "vitest";
import { toCsv } from "./csvExport";

interface Row {
  name: string;
  amount: number;
  note: string | null;
}

const COLUMNS = [
  { header: "Name", value: (r: Row) => r.name },
  { header: "Amount", value: (r: Row) => r.amount },
  { header: "Note", value: (r: Row) => r.note },
];

describe("toCsv", () => {
  it("writes a header row followed by one row per record", () => {
    const csv = toCsv<Row>([{ name: "Rent", amount: 15000, note: null }], COLUMNS);
    const lines = csv.replace(/^﻿/, "").split("\r\n");
    expect(lines[0]).toBe("Name,Amount,Note");
    expect(lines[1]).toBe("Rent,15000,");
  });

  it("quotes a value containing a comma", () => {
    const csv = toCsv<Row>([{ name: "Ravi, Kumar", amount: 500, note: null }], COLUMNS);
    expect(csv).toContain('"Ravi, Kumar"');
  });

  it("quotes and doubles an embedded quote character", () => {
    const csv = toCsv<Row>([{ name: 'The "Diwali" push', amount: 500, note: null }], COLUMNS);
    expect(csv).toContain('"The ""Diwali"" push"');
  });

  it("quotes a value containing a newline", () => {
    const csv = toCsv<Row>([{ name: "Ravi", amount: 500, note: "line one\nline two" }], COLUMNS);
    expect(csv).toContain('"line one\nline two"');
  });

  it("renders null/undefined as an empty cell, not the literal word null", () => {
    const csv = toCsv<Row>([{ name: "Ravi", amount: 0, note: null }], COLUMNS);
    expect(csv).not.toContain("null");
  });

  it("leads with a UTF-8 BOM so ₹ survives being opened in Excel", () => {
    const csv = toCsv<Row>([{ name: "₹ test", amount: 1, note: null }], COLUMNS);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("produces an empty-but-headered CSV for zero rows", () => {
    const csv = toCsv<Row>([], COLUMNS);
    expect(csv.replace(/^﻿/, "")).toBe("Name,Amount,Note");
  });
});
