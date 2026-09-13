export interface PendingRequest {
  releaseAdmission(): void;
  reject(error: Error): void;
}

/** Owns pending metadata retirement, not native/resident grants. Callers validate
 * response shape and worker identity before lookup/retirement. Rejection is not
 * an acknowledgement of native rollback, backing release or worker exit.
 */
export class PendingRequests<T extends PendingRequest> {
  private readonly entries = new Map<number, T>();
  private lastId = 0;
  public get size(): number {
    return this.entries.size;
  }
  public has(id: number): boolean {
    return this.entries.has(id);
  }
  public register(id: number, entry: T): void {
    if (!Number.isSafeInteger(id) || id <= this.lastId)
      throw new Error("Invalid or reused pending request identity");
    this.entries.set(id, entry);
    this.lastId = id;
  }
  public require(id: number): T {
    const entry = this.entries.get(id);
    if (!entry) throw new Error("Unknown or stale persistence reply");
    return entry;
  }
  public retire(id: number, expected: T): void {
    if (this.require(id) !== expected)
      throw new Error("Pending request identity mismatch");
    this.entries.delete(id);
    expected.releaseAdmission();
  }
  public rejectAll(error: Error): void {
    for (const [id, entry] of this.entries) {
      this.retire(id, entry);
      entry.reject(error);
    }
  }
}
