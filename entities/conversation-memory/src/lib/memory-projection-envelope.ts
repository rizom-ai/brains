import {
  ProjectionJsonObjectSchema,
  z,
  type ContentVisibility,
  type ProjectionJsonObject,
} from "@brains/sdk/entities";

const ENVELOPE_PREFIX = "<!-- conversation-memory-envelope:v1:";
const ENVELOPE_SUFFIX = " -->";
const ENVELOPE_PATTERN =
  /\n?<!-- conversation-memory-envelope:v1:([A-Za-z0-9_-]+) -->\s*$/u;

export interface ProjectedMemoryWrite extends ProjectionJsonObject {
  id: string;
  entityType: string;
  content: string;
  metadata: ProjectionJsonObject;
  visibility: ContentVisibility;
}

export interface MemoryProjectionEnvelope extends ProjectionJsonObject {
  version: 1;
  decisions: ProjectedMemoryWrite[];
  actionItems: ProjectedMemoryWrite[];
}

const projectedMemoryEntitySchema: z.ZodType<ProjectedMemoryWrite> =
  z.strictObject({
    id: z.string().min(1),
    entityType: z.enum(["decision", "action-item"]),
    content: z.string(),
    metadata: ProjectionJsonObjectSchema,
    visibility: z.enum(["public", "shared", "restricted"]),
  });

const memoryProjectionEnvelopeSchema: z.ZodType<MemoryProjectionEnvelope> =
  z.strictObject({
    version: z.literal(1),
    decisions: z.array(projectedMemoryEntitySchema),
    actionItems: z.array(projectedMemoryEntitySchema),
  });

function encodeEnvelope(envelope: MemoryProjectionEnvelope): string {
  const canonical: MemoryProjectionEnvelope = {
    version: 1,
    decisions: [...envelope.decisions].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    actionItems: [...envelope.actionItems].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
  };
  return Buffer.from(JSON.stringify(canonical), "utf8").toString("base64url");
}

/** Add machine-readable projection data without changing rendered narrative. */
export function appendMemoryProjectionEnvelope(
  content: string,
  envelope: MemoryProjectionEnvelope,
): string {
  const narrative = stripMemoryProjectionEnvelope(content).trimEnd();
  return `${narrative}\n\n${ENVELOPE_PREFIX}${encodeEnvelope(envelope)}${ENVELOPE_SUFFIX}\n`;
}

/** Return null for pre-envelope or malformed summaries; callers must abstain. */
export function parseMemoryProjectionEnvelope(
  content: string,
): MemoryProjectionEnvelope | null {
  const match = ENVELOPE_PATTERN.exec(content);
  const encoded = match?.[1];
  if (!encoded) return null;

  try {
    const decoded = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as unknown;
    const parsed = memoryProjectionEnvelopeSchema.safeParse(decoded);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function stripMemoryProjectionEnvelope(content: string): string {
  return content.replace(ENVELOPE_PATTERN, "").trimEnd() + "\n";
}

export function mergeProjectedMemoryEntities(
  existing: readonly ProjectedMemoryWrite[],
  additions: readonly ProjectedMemoryWrite[],
): ProjectedMemoryWrite[] {
  return Array.from(
    new Map([...existing, ...additions].map((entity) => [entity.id, entity])),
  ).map(([, entity]) => entity);
}
