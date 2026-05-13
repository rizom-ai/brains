/**
 * Derive the preview domain for a deployed brain instance.
 *
 * Examples:
 * - yeehaa.io -> preview.yeehaa.io
 * - mylittlephoney.com -> preview.mylittlephoney.com
 * - recall.rizom.ai -> recall-preview.rizom.ai
 */
export function derivePreviewDomain(domain: string): string {
  const normalized = domain.trim().replace(/^https?:\/\//, "");
  const labels = normalized.split(".").filter(Boolean);

  if (labels.length >= 3) {
    const [firstLabel, ...rest] = labels;
    if (!firstLabel || rest.length === 0) {
      return `preview.${normalized}`;
    }
    return `${firstLabel}-preview.${rest.join(".")}`;
  }

  return `preview.${normalized}`;
}
