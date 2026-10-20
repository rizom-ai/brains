import { Scanner } from "@tailwindcss/oxide";

/** What a collection needs of Tailwind's scanner. */
export type CandidateScanner = Pick<Scanner, "scanFiles">;

/** Pages scanned at once: Tailwind reads a batch in parallel. */
const DEFAULT_BATCH_SIZE = 64;

/**
 * The utility candidates Tailwind would find in a build's pages, collected as
 * each page is rendered, with Tailwind's own extractor. Styling then reads one
 * file of candidates instead of every page again: scanning a book brain's
 * tens of thousands of pages held hundreds of megabytes after the build.
 * Pages are scanned a batch at a time, which Tailwind does in parallel; one
 * page at a time took twenty times as long.
 */
export class TailwindCandidates {
  private readonly scanner: CandidateScanner;
  private readonly batchSize: number;
  private readonly seen = new Set<string>();
  private pending: string[] = [];

  constructor(
    scanner: CandidateScanner = new Scanner({}),
    batchSize: number = DEFAULT_BATCH_SIZE,
  ) {
    this.scanner = scanner;
    this.batchSize = batchSize;
  }

  /** Collect the candidates in one emitted page. */
  add(content: string): void {
    this.pending.push(content);
    if (this.pending.length >= this.batchSize) this.scanPending();
  }

  /** Every candidate collected, one per line, in a stable order. */
  toSource(): string {
    this.scanPending();
    return [...this.seen].sort().join("\n");
  }

  private scanPending(): void {
    if (this.pending.length === 0) return;
    const batch = this.pending;
    this.pending = [];
    this.scanner
      .scanFiles(batch.map((content) => ({ content, extension: "html" })))
      .forEach((candidate) => this.seen.add(candidate));
  }
}
