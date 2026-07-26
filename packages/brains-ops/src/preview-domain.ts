import { derivePreviewDomain as deriveSitePreviewDomain } from "@brains/site-composition";

export interface PreviewDomainOptions {
  sharedDomain?: string | undefined;
}

/**
 * Public operator-facing wrapper around the runtime's preview-domain rule.
 * Keeping deploy resolution on this function prevents DNS, proxy, and runtime
 * metadata from drifting onto different host shapes.
 */
export function derivePreviewDomain(
  domain: string,
  options: PreviewDomainOptions = {},
): string {
  return deriveSitePreviewDomain(domain, options);
}
