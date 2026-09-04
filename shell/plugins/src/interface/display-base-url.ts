/**
 * Which URL this brain's own links are addressed by, right now.
 *
 * `siteUrl` is what the brain is called publicly; `localSiteUrl` is where its
 * pages actually are while a runtime serves them itself. Which one wins is a
 * rule, not a fact any package owns — and an interface resolving an artifact
 * link back to its entity has to agree with whatever wrote that link. Three
 * packages had each written this expression out; deciding it once is what
 * keeps them from disagreeing.
 */
export function effectiveDisplayBaseUrl(context: {
  readonly siteUrl?: string | undefined;
  readonly localSiteUrl?: string | undefined;
  readonly preferLocalUrls?: boolean | undefined;
}): string | undefined {
  if (context.preferLocalUrls && context.localSiteUrl) {
    return context.localSiteUrl;
  }
  return context.siteUrl ?? context.localSiteUrl;
}
