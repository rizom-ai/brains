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
 * Fetch a resource from URL and return as base64 data URL
 * @param url - The URL to fetch
 * @param expectedContentType - Optional content type prefix to validate (e.g., "image/")
 * @returns Base64 data URL string
 */
export async function fetchAsBase64DataUrl(
  url: string,
  expectedContentType?: string,
): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch: ${response.status} ${response.statusText}`,
    );
  }

  const contentType = response.headers.get("content-type");
  if (expectedContentType && !contentType?.startsWith(expectedContentType)) {
    throw new Error(
      `URL does not point to expected content type: ${contentType}`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");

  // Use the actual content type for the data URL
  const mimeType = contentType?.split(";")[0] ?? "application/octet-stream";

  return `data:${mimeType};base64,${base64}`;
}

/**
 * Fetch an image from URL and return as base64 data URL
 * Convenience wrapper for fetchAsBase64DataUrl with image validation
 */
export async function fetchImageAsBase64(url: string): Promise<string> {
  return fetchAsBase64DataUrl(url, "image/");
}
