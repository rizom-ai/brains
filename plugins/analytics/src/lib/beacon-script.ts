/**
 * Generate a Cloudflare Web Analytics beacon script tag.
 *
 * @param token - The public Web Analytics site token, not the metrics site tag
 * @returns HTML script tag for the beacon
 */
export function generateCloudflareBeaconScript(token: string): string {
  // JSON escapes quotes/control characters. Escape HTML-significant characters
  // as JSON Unicode escapes so the single-quoted attribute remains intact.
  const data = JSON.stringify({ token })
    .replaceAll("&", "\\u0026")
    .replaceAll("'", "\\u0027")
    .replaceAll("<", "\\u003c");
  return `<script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='${data}'></script>`;
}
