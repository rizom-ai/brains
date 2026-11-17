import type { AppendAuthAuditEventInput } from "@brains/contracts";
import {
  EntityValidationError,
  type BaseEntity,
} from "@brains/sdk/internal/entity-runtime";
import type { DavRoutesOptions } from "../src/dav-routes";
import { fakeReader } from "./fake-reader";

/** Writes for a test that makes none: every one of them fails loudly. */
export const noWrites: DavRoutesOptions["writes"] = {
  maxFileBytes: 1024,
  deserializeEntity: () => {
    throw new Error("No writes expected");
  },
  updateEntity: async () => {
    throw new Error("No writes expected");
  },
  permissions: {
    assertEntityActionAllowed: () => {
      throw new Error("No writes expected");
    },
  },
  recordAudit: async () => {
    throw new Error("No writes expected");
  },
};

/** What a save handed the entity service. */
export interface RecordedUpdate {
  entity: BaseEntity;
  expectedContentHash: string | undefined;
  interfaceType: string | undefined;
  actorUserId: string | undefined;
}

export interface FakeBrain {
  options: Pick<DavRoutesOptions, "reader" | "writes">;
  entities: BaseEntity[];
  updates: RecordedUpdate[];
  audit: AppendAuthAuditEventInput[];
  /** Runs once, just before the next update is applied: another writer. */
  beforeNextUpdate: (() => void) | undefined;
}

function frontmatter(markdown: string): Record<string, string> {
  const block = /^---\n([\s\S]*?)\n---/.exec(markdown)?.[1] ?? "";
  return Object.fromEntries(
    block
      .split("\n")
      .map((line) => /^([a-zA-Z]+):\s*(.*)$/.exec(line))
      .filter((match) => match !== null)
      .map((match) => [match[1] ?? "", match[2] ?? ""]),
  );
}

/**
 * A brain's reads and writes over one list of entities. A document whose
 * frontmatter says `title: INVALID` fails validation, `title: UNPARSEABLE`
 * cannot be parsed at all, one with
 * `title: NORMALIZE` is stored in another form than it was sent, and types
 * named `locked` refuse updates; `post` has a published status.
 */
export function fakeBrain(entities: BaseEntity[]): FakeBrain {
  const brain: FakeBrain = {
    entities,
    updates: [],
    audit: [],
    beforeNextUpdate: undefined,
    options: {
      reader: {
        ...fakeReader({ entities }),
        getEntityTypeConfig: (type) =>
          type === "post"
            ? { publish: { publishStatuses: ["published"] } }
            : {},
      },
      writes: {
        maxFileBytes: 1024,
        deserializeEntity: (markdown, entityType) => {
          const fields = frontmatter(markdown);
          if (fields["title"] === "UNPARSEABLE") {
            // What a YAML parser throws: no validation error class at all.
            throw new Error("unexpected end of the stream (3:1)");
          }
          if (fields["title"] === "INVALID") {
            throw new EntityValidationError(
              entityType,
              new Error("title: must not be INVALID"),
            );
          }
          const { visibility, ...metadata } = fields;
          return {
            content: markdown,
            metadata,
            ...(visibility === "public" ||
            visibility === "shared" ||
            visibility === "restricted"
              ? { visibility }
              : {}),
          };
        },
        permissions: {
          assertEntityActionAllowed: (entityType, action, context) => {
            if (entityType === "locked") {
              throw new Error("Updating `locked` is not allowed.");
            }
            if (
              action === "publish" &&
              context.userPermissionLevel !== "admin"
            ) {
              throw new Error("Publishing `post` requires admin permission.");
            }
          },
        },
        updateEntity: async (request) => {
          brain.beforeNextUpdate?.();
          brain.beforeNextUpdate = undefined;
          const index = entities.findIndex(
            (candidate) =>
              candidate.entityType === request.entity.entityType &&
              candidate.id === request.entity.id,
          );
          const stored = entities[index];
          if (!stored) throw new Error("Entity not found");
          const expected = request.options?.expectedContentHash;
          if (expected !== undefined && stored.contentHash !== expected) {
            return {
              entityId: stored.id,
              jobId: "",
              skipped: true,
              skipReason: "content-conflict" as const,
            };
          }
          brain.updates.push({
            entity: request.entity,
            expectedContentHash: expected,
            interfaceType: request.options?.eventContext?.interfaceType,
            actorUserId:
              request.options?.eventContext?.actor?.kind === "user"
                ? request.options.eventContext.actor.userId
                : undefined,
          });
          const content = request.entity.content.includes("title: NORMALIZE")
            ? request.entity.content.replace("NORMALIZE", "Normalized")
            : request.entity.content;
          entities[index] = {
            ...request.entity,
            content,
            contentHash: `hash-of-${content.length}-${brain.updates.length}`,
            updated: "2026-11-18T09:00:00.000Z",
          };
          return { entityId: stored.id, jobId: "job-1", skipped: false };
        },
        recordAudit: async (event) => {
          brain.audit.push(event);
        },
      },
    },
  };
  return brain;
}
