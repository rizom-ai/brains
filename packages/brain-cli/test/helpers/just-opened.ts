import type { EntityService } from "@brains/entity-service";
import { isRecord } from "@brains/utils/is-record";

/**
 * A Studio save names the version the editor opened. A test that sends an
 * update without one saves as an editor who opened the entry just now: the
 * stored version's hash is filled in.
 */
export async function asJustOpened(
  service: Pick<EntityService, "getEntityRaw">,
  method: string,
  path: string,
  body: unknown,
): Promise<unknown> {
  if (method !== "PUT" || path.split("?")[0] !== "entities") return body;
  if (!isRecord(body) || body["baseContentHash"] !== undefined) return body;
  const { entityType, id } = body;
  if (typeof entityType !== "string" || typeof id !== "string") return body;
  const stored = await service.getEntityRaw({
    entityType,
    id,
    visibilityScope: "restricted",
    source: true,
  });
  return { ...body, baseContentHash: stored?.contentHash ?? "no-such-version" };
}
