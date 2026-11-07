/** Test helpers: async iterables from arrays, and fixed-width lines built from 1-based columns. */
export async function* from<T>(items: T[]): AsyncGenerator<T> {
  for (const i of items) yield i;
}

export async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}

/** A line of `width` spaces with each value written at its 1-based start column. */
export function fixed(width: number, fields: [from: number, value: string][]): string {
  const chars = Array.from({ length: width }, () => " ");
  for (const [at, value] of fields) for (let i = 0; i < value.length; i++) chars[at - 1 + i] = value[i]!;
  return chars.join("");
}
