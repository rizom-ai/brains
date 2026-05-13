/**
 * Derive the preview domain for a deployed brain instance.
 *
 * Examples:
 * - yeehaa.io -> preview.yeehaa.io
 * - mylittlephoney.com -> preview.mylittlephoney.com
 * - recall.rizom.ai -> preview.recall.rizom.ai
 */
export function derivePreviewDomain(domain: string): string {
  const normalized = domain.trim().replace(/^https?:\/\//, "");
  return `preview.${normalized}`;
}
