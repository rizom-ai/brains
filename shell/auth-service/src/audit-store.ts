import { desc } from "drizzle-orm";
import { createPrefixedId } from "@brains/utils/id";
import type { AuthRuntimeDB } from "./runtime-db";
import { authAuditEvents } from "./runtime-schema";

export interface AppendAuthAuditEventInput {
  actorUserId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

export interface AuthAuditEvent {
  id: string;
  actorUserId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
}

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
      .orderBy(desc(authAuditEvents.createdAt));
    return rows.map((row) => ({
      id: row.id,
      ...(row.actorUserId ? { actorUserId: row.actorUserId } : {}),
      action: row.action,
      ...(row.targetType ? { targetType: row.targetType } : {}),
      ...(row.targetId ? { targetId: row.targetId } : {}),
      ...(row.metadataJson
        ? { metadata: parseMetadata(row.metadataJson) }
        : {}),
      createdAt: row.createdAt,
    }));
  }
}

function parseMetadata(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value);
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}
