import { SdkError, z } from "@brains/sdk/interfaces";
import type { InterfaceSetupContext } from "@brains/sdk/interfaces";
import type { SourceCitation, AgentResponse } from "@brains/contracts";
import type { Artifact, Task } from "@a2a-js/sdk";

export const SOURCES_ARTIFACT_NAME = "sources";
export const MAX_SOURCE_COUNT = 20;
export type PublicSourceReader = InterfaceSetupContext<
  z.ZodType<object, object>
>["publicSources"];

const safeUrl = z
  .string()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  });
const citationSchema = z.object({
  id: z.string().min(1).max(641),
  source: z.string().min(1).max(128),
  title: z.string().min(1).max(512).optional(),
  url: safeUrl,
  entityType: z.string().min(1).max(128).optional(),
  entityId: z.string().min(1).max(512).optional(),
  excerpt: z.string().min(1).max(1000).optional(),
  // Remote brain/provenance claims are deliberately not copied.
});
const artifactsSchema = z
  .array(
    z.object({
      name: z.string().max(128).optional(),
      parts: z.array(z.unknown()).max(16),
    }),
  )
  .max(16);
const dataPartSchema = z.object({
  kind: z.literal("data"),
  data: z.object({ sources: z.array(citationSchema).max(MAX_SOURCE_COUNT) }),
});

/** Shape/size validation is not proof that a peer's documents are public or true. */
export function readSourceArtifacts(artifacts: unknown): SourceCitation[] {
  if (artifacts === undefined) return [];
  const parsed = artifactsSchema.safeParse(artifacts);
  if (!parsed.success)
    throw new SdkError("invalid_response", { cause: parsed.error });
  const sources: SourceCitation[] = [];
  for (const artifact of parsed.data) {
    if (artifact.name !== SOURCES_ARTIFACT_NAME) continue;
    for (const part of artifact.parts) {
      const data = dataPartSchema.safeParse(part);
      if (!data.success)
        throw new SdkError("invalid_response", { cause: data.error });
      if (sources.length + data.data.data.sources.length > MAX_SOURCE_COUNT)
        throw new SdkError("invalid_response");
      sources.push(...data.data.data.sources);
    }
  }
  return sources;
}

/** Bind identity only after the client validates the peer card and endpoint. */
export function attributePeerSources(
  sources: readonly SourceCitation[],
  peer: { name: string; origin: string },
): SourceCitation[] {
  if (
    sources.some(
      (source) => !source.url || new URL(source.url).origin !== peer.origin,
    )
  )
    throw new SdkError("invalid_response");
  const seen = new Set<string>();
  return sources
    .map((source) => ({
      ...source,
      id: JSON.stringify([peer.origin, source.id]),
      // These are remote identifiers, never authority to read a local entity.
      brain: {
        name: peer.name.trim().slice(0, 128) || new URL(peer.origin).hostname,
        url: peer.origin,
      },
    }))
    .filter((source) => {
      if (seen.has(source.id)) return false;
      seen.add(source.id);
      return true;
    });
}

export function sourceArtifact(sources: readonly SourceCitation[]): Artifact {
  const parsed = z
    .array(citationSchema)
    .max(MAX_SOURCE_COUNT)
    .safeParse(sources);
  if (!parsed.success)
    throw new SdkError("invalid_response", { cause: parsed.error });
  const artifact: Artifact = {
    artifactId: crypto.randomUUID(),
    name: SOURCES_ARTIFACT_NAME,
    parts: [{ kind: "data", data: { sources: parsed.data } }],
  };
  // Leave room for the SSE envelope inside the client's 128 KiB frame limit.
  if (
    new TextEncoder().encode(JSON.stringify(artifact)).byteLength >
    120 * 1024
  )
    throw new SdkError("invalid_response");
  return artifact;
}

export async function resolveAnswerSources(
  response: AgentResponse,
  reader: PublicSourceReader | undefined,
  signal: AbortSignal,
): Promise<readonly SourceCitation[]> {
  if (!reader) return [];
  const cards = response.cards ?? [];
  if (cards.length > 32) throw new SdkError("invalid_response");
  const candidates: SourceCitation[] = [];
  for (const card of cards) {
    if (card.kind !== "sources") continue;
    if (candidates.length + card.sources.length > MAX_SOURCE_COUNT)
      throw new SdkError("invalid_response");
    candidates.push(...card.sources);
  }
  const references = candidates.flatMap((source) =>
    source.entityType && source.entityId
      ? [{ entityType: source.entityType, id: source.entityId }]
      : [],
  );
  return reader.resolve(references, signal);
}

/** Revalidate on polling/replay too: stored citation text is never a publication grant. */
export async function publicTaskSources(
  task: Task,
  reader: PublicSourceReader | undefined,
  signal: AbortSignal,
): Promise<Task> {
  const candidates = readSourceArtifacts(task.artifacts);
  const references = candidates.flatMap((source) =>
    source.entityType && source.entityId
      ? [{ entityType: source.entityType, id: source.entityId }]
      : [],
  );
  const sources = reader ? await reader.resolve(references, signal) : [];
  signal.throwIfAborted();
  const other = (task.artifacts ?? []).filter(
    (artifact) => artifact.name !== SOURCES_ARTIFACT_NAME,
  );
  return {
    ...task,
    artifacts: [...other, ...(sources.length ? [sourceArtifact(sources)] : [])],
  };
}
