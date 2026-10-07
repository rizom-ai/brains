export type {
  AppendAuthAuditEventInput,
  AuthAuditActionCount,
  AuthAuditEvent,
  AuthAuditQuery,
  AuthAuditQueryResult,
} from "@brains/plugins";
import type {
  AppendAuthAuditEventInput,
  AuthAuditEvent,
  AuthAuditQuery,
  AuthAuditQueryResult,
} from "@brains/plugins";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { createPrefixedId } from "@brains/utils/id";
import { isPlainRecord } from "@brains/utils/predicates";
import type { AuthRuntimeDB } from "./runtime-db";
import { authAuditEvents } from "./runtime-schema";

export class AuthAuditStore {
  private readonly db: AuthRuntimeDB;
  private lastCreatedAt = 0;

  constructor(db: AuthRuntimeDB) {
    this.db = db;
  }

  async append(input: AppendAuthAuditEventInput): Promise<AuthAuditEvent> {
    const createdAt = Math.max(Date.now(), this.lastCreatedAt + 1);
    this.lastCreatedAt = createdAt;
    const event: AuthAuditEvent = {
      id: createPrefixedId("aae"),
      ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
      action: input.action,
      ...(input.targetType ? { targetType: input.targetType } : {}),
      ...(input.targetId ? { targetId: input.targetId } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
      createdAt,
    };

    await this.db.insert(authAuditEvents).values({
      id: event.id,
      actorUserId: event.actorUserId ?? null,
      action: event.action,
      targetType: event.targetType ?? null,
      targetId: event.targetId ?? null,
      metadataJson: event.metadata ? JSON.stringify(event.metadata) : null,
      createdAt: event.createdAt,
    });
    return event;
  }

  async list(): Promise<AuthAuditEvent[]> {
    const rows = await this.db
      .select()
      .from(authAuditEvents)
      .orderBy(desc(authAuditEvents.createdAt), desc(sql`rowid`));
    return rows.map(auditEventFromRow);
  }

  async query(input: AuthAuditQuery): Promise<AuthAuditQueryResult> {
    const filter = and(
      input.actorUserId
        ? eq(authAuditEvents.actorUserId, input.actorUserId)
        : undefined,
      input.action ? eq(authAuditEvents.action, input.action) : undefined,
    );
    const [eventRows, totalRows, actionRows] = await Promise.all([
      this.db
        .select()
        .from(authAuditEvents)
        .where(filter)
        .orderBy(desc(authAuditEvents.createdAt), desc(sql`rowid`))
        .limit(input.limit)
        .offset(input.offset),
      this.db.select({ value: count() }).from(authAuditEvents).where(filter),
      this.db
        .select({ action: authAuditEvents.action, value: count() })
        .from(authAuditEvents)
        .groupBy(authAuditEvents.action),
    ]);
    const selectedRows = input.selectedId
      ? await this.db
          .select()
          .from(authAuditEvents)
          .where(and(filter, eq(authAuditEvents.id, input.selectedId)))
          .limit(1)
      : [];
    const selected = selectedRows[0];
    return {
      events: eventRows.map(auditEventFromRow),
      ...(selected ? { selectedEvent: auditEventFromRow(selected) } : {}),
      actions: actionRows.map((row) => ({
        action: row.action,
        count: row.value,
      })),
      total: totalRows[0]?.value ?? 0,
    };
  }
}

function auditEventFromRow(
  row: typeof authAuditEvents.$inferSelect,
): AuthAuditEvent {
  return {
    id: row.id,
    ...(row.actorUserId ? { actorUserId: row.actorUserId } : {}),
    action: row.action,
    ...(row.targetType ? { targetType: row.targetType } : {}),
    ...(row.targetId ? { targetId: row.targetId } : {}),
    ...(row.metadataJson ? { metadata: parseMetadata(row.metadataJson) } : {}),
    createdAt: row.createdAt,
  };
}

function parseMetadata(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value);
  return isPlainRecord(parsed) ? parsed : {};
}
