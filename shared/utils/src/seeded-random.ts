/**
 * A repeatable random sequence (mulberry32): the same seed gives the same
 * numbers in [0, 1), so a layout drawn from it is the same on every render.
 */
export function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return (): number => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let mixed = Math.imul(value ^ (value >>> 15), 1 | value);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}
