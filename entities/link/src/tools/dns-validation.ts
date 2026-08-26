import { lookup } from "dns/promises";

/**
 * Validation result for DNS check
 */
export interface DnsValidationResult {
  valid: boolean;
  error?: string;
}

/** Resolves a hostname or rejects with a DNS errno error. */
export type DnsLookup = (hostname: string) => Promise<unknown>;

/**
 * Validate that a URL's domain is resolvable via DNS
 * Fast check (milliseconds) to catch obviously invalid domains
 *
 * Tests pass their own `lookupFn` so validation stays off the network.
 */
export async function validateDomain(
  url: string,
  lookupFn: DnsLookup = lookup,
): Promise<DnsValidationResult> {
  try {
    const hostname = new URL(url).hostname;
    await lookupFn(hostname);
    return { valid: true };
  } catch (error) {
    // Handle URL parsing errors
    if (error instanceof TypeError) {
      return { valid: false, error: "Invalid URL" };
    }

    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOTFOUND") {
      return { valid: false, error: "Domain does not exist" };
    }
    if (code === "EAI_AGAIN") {
      return { valid: false, error: "DNS lookup failed (temporary)" };
    }
    // Other DNS errors - let the job handler deal with it
    return { valid: true };
  }
}
