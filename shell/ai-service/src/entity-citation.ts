import type { SourceCitation } from "@brains/contracts";

/** Where the site shows an entity, read from its display config. */
export interface EntityLinks {
  /** Whether the site offers this type as a source. */
  isCitable: (entityType: string) => boolean;
  /** The site path of an entity of this type. */
  urlFor: (entityType: string, slug: string) => string;
  /** The domain the site is published at; without it, sources carry no address. */
  siteBaseUrl: string | undefined;
}

/** What a citation needs of an entity. */
export interface CitableEntity {
  id: string;
  entityType: string;
  metadata: Record<string, unknown>;
}

export function metadataString(
  metadata: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

/** The address of an entity's page, when the site cites its type. */
function pageUrl(
  entity: CitableEntity,
  links: EntityLinks | undefined,
): string | undefined {
  if (!links?.isCitable(entity.entityType)) return undefined;
  // The deployment's domain, with or without a scheme; the site is served over https.
  const domain = links.siteBaseUrl
    ?.replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  if (!domain) return undefined;
  const slug = metadataString(entity.metadata, "slug") ?? entity.id;
  return new URL(links.urlFor(entity.entityType, slug), `https://${domain}`)
    .href;
}

/** An entity's name as its page carries it, as a section by its siglum. */
export function entityTitle(entity: CitableEntity): string {
  return (
    metadataString(entity.metadata, "pageTitle") ??
    metadataString(entity.metadata, "title") ??
    metadataString(entity.metadata, "name") ??
    metadataString(entity.metadata, "slug") ??
    entity.id
  );
}

/**
 * An entity as a source: named as its page names it, as a section by its
 * siglum, and linked to that page when the site cites its type. An address
 * the entity records itself wins.
 */
export function entitySourceCitation(
  entity: CitableEntity,
  links: EntityLinks | undefined,
): SourceCitation {
  const title = entityTitle(entity);
  const url =
    metadataString(entity.metadata, "url") ??
    metadataString(entity.metadata, "permalink") ??
    metadataString(entity.metadata, "canonicalUrl") ??
    pageUrl(entity, links);
  return {
    id: `${entity.entityType}:${entity.id}`,
    title,
    source: entity.entityType,
    entityType: entity.entityType,
    entityId: entity.id,
    ...(url ? { url } : {}),
  };
}
