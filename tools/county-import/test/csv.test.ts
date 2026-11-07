import { describe, expect, it } from "vitest";
import { CsvParser, csvRows } from "../src/csv.js";
import { collect, from } from "./helpers.js";

describe("CsvParser", () => {
  it("reads quotes, doubled quotes, commas and line breaks inside quotes, across chunk edges", () => {
    const p = new CsvParser();
    const text = 'A,B,C\r\n"x, y","say ""hi""",3\n"two\nlines",,"end"';
    const recs: string[][] = [];
    for (const ch of text) recs.push(...p.push(ch)); // one character at a time
    recs.push(...p.end());
    expect(recs).toEqual([
      ["A", "B", "C"],
      ["x, y", 'say "hi"', "3"],
      ["two\nlines", "", "end"],
    ]);
  });
  it("adds no empty record for a trailing line break", () => {
    const p = new CsvParser();
    expect([...p.push("a,b\n"), ...p.end()]).toEqual([["a", "b"]]);
  });
});

describe("csvRows", () => {
  it("keys rows by the trimmed, upper-cased header and trims fields", async () => {
    const rows = await collect(csvRows(from(['﻿Account_Num, Yr_Built\n" 001 ",1985\n', "002,\n"])));
    expect(rows).toEqual([
      { ACCOUNT_NUM: "001", YR_BUILT: "1985" },
      { ACCOUNT_NUM: "002", YR_BUILT: "" },
    ]);
  });
});
