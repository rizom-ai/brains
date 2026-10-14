import { SdkError, toSdkError, type SourceCitation } from "@brains/contracts";
import {
  EntityUrlGenerator,
  type EntityDisplayMap,
} from "@brains/site-composition";
import { z } from "@brains/utils/zod";
import type { InterfaceEntityReader } from "../interface/interface-definition-contract";
import { sitePageUrl } from "./site-page-url";

const referencesSchema = z
  .array(
    z.strictObject({
      entityType: z.string().min(1).max(128),
      id: z.string().min(1).max(512),
    }),
  )
  .max(20);

/** Named consumer: A2A source artifacts. No caller-supplied citation text or scope. */
export function createPublicSources(
  entities: Pick<InterfaceEntityReader, "getEntity">,
  siteUrl: string | undefined,
  display: EntityDisplayMap | undefined,
  lifetime: AbortSignal,
): {
  resolve(
    references: readonly { readonly entityType: string; readonly id: string }[],
    signal: AbortSignal,
  ): Promise<readonly SourceCitation[]>;
} {
  const detachedDisplay =
    display === undefined ? undefined : structuredClone(display);
  const routes = new EntityUrlGenerator(detachedDisplay);
  return Object.freeze({
    async resolve(references, signal): Promise<readonly SourceCitation[]> {
      if (!(signal instanceof AbortSignal)) throw new SdkError("invalid_input");
      const combined = AbortSignal.any([lifetime, signal]);
      const active = (): void => {
        if (combined.aborted)
          throw new SdkError("cancelled", { cause: combined.reason });
      };
      try {
        active();
        const parsed = referencesSchema.safeParse(references);
        if (!parsed.success)
          throw new SdkError("invalid_input", { cause: parsed.error });
        const result: SourceCitation[] = [];
        const seen = new Set<string>();
        for (const reference of parsed.data) {
          active();
          const key = JSON.stringify([reference.entityType, reference.id]);
          if (seen.has(key) || !routes.isCitable(reference.entityType))
            continue;
          seen.add(key);
          const entity = await entities.getEntity({
            ...reference,
            visibilityScope: "public",
            publishedOnly: true,
          });
          active();
          if (
            entity?.visibility !== "public" ||
            entity.metadata["citable"] === false
          )
            continue;
          const url = sitePageUrl(siteUrl, entity, detachedDisplay);
          if (!url || url.length > 2048) continue;
          const address = new URL(url);
          if (
            address.protocol !== "https:" ||
            address.username ||
            address.password
          )
            continue;
          const title = [
            entity.metadata["pageTitle"],
            entity.metadata["title"],
            entity.metadata["name"],
          ].find(
            (value): value is string =>
              typeof value === "string" && value.trim().length > 0,
          );
          result.push(
            Object.freeze({
              id: `${reference.entityType}:${reference.id}`,
              source: reference.entityType,
              entityType: reference.entityType,
              entityId: reference.id,
              url,
              ...(title ? { title: title.trim().slice(0, 512) } : {}),
            }),
          );
        }
        active();
        return Object.freeze(result);
      } catch (cause) {
        throw toSdkError(cause);
      }
    },
  });
}
