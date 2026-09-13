import {
  MAX_MIGRATION_BYTES,
  MAX_MIGRATION_PLANS,
  MAX_MIGRATION_STATEMENTS,
  parseCommand,
  snapshotStatement,
  statementBytes,
  type MigrationCommand,
  type MigrationToken,
  type SqlStatement,
} from "./protocol";
import { assertOrdinarySql } from "./sql-admission";

interface Plan {
  bytes: number;
  count: number;
  received: number;
  statements: SqlStatement[];
  running: boolean;
}

// Worker-owned metadata only. No native call until the entire plan is admitted.
// Reservations survive queued execution and are released by its final outcome.
export class MigrationPlans {
  private readonly generation: string;
  private readonly plans = new Map<number, Plan>();
  private reserved = 0;
  private lastId = 0;
  private closing = false;
  public constructor(generation: string) {
    this.generation = generation;
  }
  public stats(): { bytes: number; plans: number } {
    return { bytes: this.reserved, plans: this.plans.size };
  }
  private checkToken(token: MigrationToken): void {
    if (token.generation !== this.generation)
      throw new Error("Foreign migration capability");
  }
  private drop(id: number): void {
    const plan = this.plans.get(id);
    if (!plan) return;
    this.reserved -= plan.bytes;
    this.plans.delete(id);
  }
  public closeAdmission(): void {
    this.closing = true;
    for (const [id, plan] of this.plans) if (!plan.running) this.drop(id);
  }
  public async execute<T>(
    input: MigrationCommand,
    requestId: number,
    run: (statements: SqlStatement[]) => Promise<T>,
  ): Promise<T | MigrationToken | undefined> {
    const parsed = parseCommand({ op: "migration", command: input });
    if (parsed.op !== "migration")
      throw new Error("Expected migration command");
    const command = parsed.command;
    if (command.action === "reserve") {
      if (this.closing) throw new Error("Migration admission is closed");
      if (!Number.isSafeInteger(requestId) || requestId <= this.lastId)
        throw new Error("Invalid migration identity");
      if (
        this.plans.size >= MAX_MIGRATION_PLANS ||
        this.reserved + command.bytes > MAX_MIGRATION_BYTES
      )
        throw new Error("Migration plan capacity exceeded");
      this.lastId = requestId;
      this.reserved += command.bytes;
      this.plans.set(requestId, {
        bytes: command.bytes,
        count: command.count,
        received: 0,
        statements: [],
        running: false,
      });
      return { generation: this.generation, id: requestId };
    }
    this.checkToken(command.token);
    const plan = this.plans.get(command.token.id);
    if (plan?.running) throw new Error("Migration plan is running");
    if (command.action === "discard") {
      this.drop(command.token.id);
      return;
    }
    if (!plan) throw new Error("Unknown or spent migration capability");
    try {
      if (command.action === "append") {
        const bytes = command.statements.reduce(
          (sum, statement) => sum + statementBytes(statement),
          0,
        );
        if (
          command.offset !== plan.statements.length ||
          plan.statements.length + command.statements.length > plan.count ||
          plan.count > MAX_MIGRATION_STATEMENTS ||
          plan.received + bytes > plan.bytes
        )
          throw new Error("Invalid migration chunk order or size");
        for (const statement of command.statements)
          assertOrdinarySql(statement.sql);
        plan.statements.push(...command.statements.map(snapshotStatement));
        plan.received += bytes;
        return;
      }
      if (
        command.count !== plan.count ||
        plan.statements.length !== plan.count ||
        plan.received !== plan.bytes
      )
        throw new Error("Incomplete migration plan");
      plan.running = true;
      return await run(plan.statements);
    } catch (error) {
      this.drop(command.token.id);
      throw error;
    } finally {
      if (plan.running) this.drop(command.token.id);
    }
  }
}
