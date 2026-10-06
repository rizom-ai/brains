/** A count with its noun, singular for one: "1 book", "3 sections". */
export function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}
