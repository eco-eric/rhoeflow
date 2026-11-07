/**
 * A small streaming CSV reader for the appraisal districts' comma files (RFC 4180: quoted fields,
 * doubled quotes, commas and line breaks inside quotes, CRLF or LF). Written here rather than
 * taken from npm so the importer adds no dependency (ADR-048).
 */
export class CsvParser {
  private field = "";
  private record: string[] = [];
  private quoted = false;
  /** The last chunk ended on a quote inside a quoted field: the next character decides. */
  private quotePending = false;
  private sawAny = false;

  /** Feeds a chunk; returns the records it completed. */
  push(chunk: string): string[][] {
    const out: string[][] = [];
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk[i]!;
      this.sawAny = true;
      if (this.quotePending) {
        this.quotePending = false;
        if (c === '"') {
          this.field += '"';
          continue;
        }
        this.quoted = false; // the quote closed the field; handle c below
      }
      if (this.quoted) {
        if (c === '"') this.quotePending = true;
        else this.field += c;
        continue;
      }
      if (c === '"' && this.field === "") this.quoted = true;
      else if (c === ",") {
        this.record.push(this.field);
        this.field = "";
      } else if (c === "\n") {
        this.record.push(this.field.endsWith("\r") ? this.field.slice(0, -1) : this.field);
        out.push(this.record);
        this.record = [];
        this.field = "";
        this.sawAny = false;
      } else this.field += c;
    }
    return out;
  }

  /** Ends the input; returns the last record when the file didn't end in a line break. */
  end(): string[][] {
    if (this.quotePending) this.quoted = false;
    if (!this.sawAny && this.record.length === 0 && this.field === "") return [];
    this.record.push(this.field.endsWith("\r") ? this.field.slice(0, -1) : this.field);
    const last = this.record;
    this.record = [];
    this.field = "";
    this.sawAny = false;
    return last.length === 1 && last[0] === "" ? [] : [last];
  }
}

/** Records from a stream of text chunks. */
export async function* csvRecords(chunks: AsyncIterable<string>): AsyncGenerator<string[]> {
  const p = new CsvParser();
  for await (const chunk of chunks) yield* p.push(chunk);
  yield* p.end();
}

/** Rows keyed by the header's names (upper case, trimmed). Fields are trimmed. */
export async function* csvRows(chunks: AsyncIterable<string>): AsyncGenerator<Record<string, string>> {
  let header: string[] | null = null;
  for await (const rec of csvRecords(chunks)) {
    if (!header) {
      header = rec.map((h) => h.replace(/^﻿/, "").trim().toUpperCase());
      continue;
    }
    if (rec.length === 1 && rec[0] === "") continue;
    const row: Record<string, string> = {};
    header.forEach((h, i) => (row[h] = (rec[i] ?? "").trim()));
    yield row;
  }
}
