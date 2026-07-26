export interface PreviewDomainOptions {
  /**
   * Shared parent whose direct tenants use sibling preview hosts so one-level
   * wildcard TLS remains valid. Defaults to the hosted Rizom parent.
   */
  sharedDomain?: string | undefined;
}

/**
 * Derive the preview domain for a deployed brain instance.
 *
 * Dedicated domains use a `preview.` child. Direct tenants of the configured
 * shared parent use a `-preview` sibling so `*.shared.example` certificates
 * cover both production and preview.
 *
 * Examples:
 * - yeehaa.io -> preview.yeehaa.io
 * - rizom.ai -> preview.rizom.ai
 * - recall.rizom.ai -> recall-preview.rizom.ai
 */
export function derivePreviewDomain(
  domain: string,
  options: PreviewDomainOptions = {},
): string {
  const normalized = normalizeDomain(domain);
  const sharedDomain = normalizeDomain(
    options.sharedDomain ?? "rizom.ai",
  ).replace(/^\./, "");
  const sharedSuffix = `.${sharedDomain}`;

  if (normalized.endsWith(sharedSuffix)) {
    const tenant = normalized.slice(0, -sharedSuffix.length);
    if (tenant.length > 0 && !tenant.includes(".")) {
      return `${tenant}-preview.${sharedDomain}`;
    }
  }

  return `preview.${normalized}`;
}

function normalizeDomain(domain: string): string {
  return domain
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "")
    .toLowerCase();
}
