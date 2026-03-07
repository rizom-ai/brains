/**
 * Generate a Cloudflare Web Analytics beacon script tag.
 *
 * @param siteTag - The Cloudflare Web Analytics site tag (token)
 * @returns HTML script tag for the beacon
 */
export function generateCloudflareBeaconScript(siteTag: string): string {
  return `<script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token":"${siteTag}"}'></script>`;
}
