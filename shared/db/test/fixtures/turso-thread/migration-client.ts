import {
  MAX_MESSAGE_BYTES,
  MAX_MIGRATION_BYTES,
  MAX_MIGRATION_PLANS,
  MAX_MIGRATION_STATEMENTS,
  migrationTokenSchema,
  snapshotStatement,
  statementBytes,
  type MigrationCommand,
  type MigrationToken,
  type ProofStatement,
} from "./protocol";
import { parseStatement } from "../../../src/turso-worker/client-protocol";
import {
  parseResults,
  type SqlResult as ProofResult,
} from "../../../src/turso-worker/result-protocol";

export interface MigrationSender {
  readonly closed: boolean;
  migration(command: MigrationCommand): Promise<unknown>;
}

export class MigrationPrograms {
  private readonly sender: MigrationSender;
  private bytes = 0;
  private plans = 0;
  public constructor(sender: MigrationSender) {
    this.sender = sender;
  }
  // Synchronous bounded admission/snapshot; no continuation retains caller views.
  public execute(inputs: ProofStatement[]): Promise<ProofResult[]> {
    try {
      if (this.sender.closed) throw new Error("Proof driver is closed");
      if (inputs.length > MAX_MIGRATION_STATEMENTS)
        throw new Error("Migration statement limit exceeded");
      if (this.plans >= MAX_MIGRATION_PLANS)
        throw new Error("Migration plan capacity exceeded");
      let bytes = 0;
      const parsed: ProofStatement[] = [];
      for (const input of inputs) {
        const statement = parseStatement(input);
        const size = statementBytes(statement);
        if (size + 512 > MAX_MESSAGE_BYTES)
          throw new Error("Migration statement exceeds chunk budget");
        bytes += size;
        if (this.bytes + bytes > MAX_MIGRATION_BYTES)
          throw new Error("Migration plan capacity exceeded");
        parsed.push(statement);
      }
      this.bytes += bytes;
      this.plans++;
      try {
        const chunks: ProofStatement[][] = [];
        let chunk: ProofStatement[] = [];
        let size = 512;
        for (const statement of parsed) {
          const next = statementBytes(statement);
          if (chunk.length === 16 || size + next > MAX_MESSAGE_BYTES) {
            chunks.push(chunk);
            chunk = [];
            size = 512;
          }
          chunk.push(snapshotStatement(statement));
          size += next;
        }
        if (chunk.length) chunks.push(chunk);
        return this.runReserved(chunks, parsed.length, bytes);
      } catch (error) {
        this.bytes -= bytes;
        this.plans--;
        throw error;
      }
    } catch (error) {
      return Promise.reject(error);
    }
  }
  private async runReserved(
    chunks: ProofStatement[][],
    count: number,
    bytes: number,
  ): Promise<ProofResult[]> {
    try {
      return await this.run(chunks, count, bytes);
    } finally {
      this.bytes -= bytes;
      this.plans--;
    }
  }
  private async run(
    chunks: ProofStatement[][],
    count: number,
    bytes: number,
  ): Promise<ProofResult[]> {
    let token: MigrationToken | undefined;
    try {
      token = migrationTokenSchema.parse(
        await this.sender.migration({ action: "reserve", bytes, count }),
      );
      let offset = 0;
      for (const statements of chunks) {
        await this.sender.migration({
          action: "append",
          token,
          offset,
          statements,
        });
        offset += statements.length;
      }
      const results = parseResults(
        await this.sender.migration({ action: "run", token, count }),
        MAX_MIGRATION_STATEMENTS,
      );
      if (results.length !== count)
        throw new Error("Invalid migration result count");
      return results;
    } catch (error) {
      // An acknowledged run consumes its plan, success or failure. Discard is
      // idempotent for spent tokens. Closing/failed owners own remaining cleanup.
      if (token && !this.sender.closed) {
        try {
          await this.sender.migration({ action: "discard", token });
        } catch (cleanup) {
          throw new AggregateError(
            [error, cleanup],
            "Migration failed; plan cleanup could not be confirmed",
            { cause: cleanup },
          );
        }
      }
      throw error;
    }
  }
}
