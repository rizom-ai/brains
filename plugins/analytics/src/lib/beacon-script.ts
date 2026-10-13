/**
 * Generate a Cloudflare Web Analytics beacon script tag.
 *
 * @param token - The Web Analytics site token (not the site tag that
 *   metrics queries filter on)
 * @returns HTML script tag for the beacon
 */
export function generateCloudflareBeaconScript(token: string): string {
  return `<script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token":"${token}"}'></script>`;
}
