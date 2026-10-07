import { expect } from "bun:test";

/** The two directions of a structured body: typed data ↔ markdown. */
export interface BodyFormatter<T> {
  format(data: T): string;
  parse(markdown: string): T;
}

/**
 * The shared round-trip contract for structured body formatters: a decoded
 * body survives a write and a read unchanged.
 */
export function expectBodyRoundTrip<T>(
  formatter: BodyFormatter<T>,
  decoded: T,
): void {
  expect(formatter.parse(formatter.format(decoded))).toEqual(decoded);
}
