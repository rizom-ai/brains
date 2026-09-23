/**
 * HTTP utility functions
 */

/**
 * Check if string is an HTTP(S) URL
 */
export function isHttpUrl(str: string): boolean {
  return /^https?:\/\//i.test(str);
}

/**
 * Fetch a resource from URL and return as plain text
 */
export async function fetchAsText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch: ${response.status} ${response.statusText}`,
    );
  }
  return response.text();
}
