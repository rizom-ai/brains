import { z } from "@brains/utils/zod";

export type LinkedInFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type LinkedInSnapshotRecord = Record<string, unknown>;

/** The rich professional domains, read for shape capture until each is mapped. */
export const RICH_DOMAINS = [
  "SKILLS",
  "POSITIONS",
  "EDUCATION",
  "CERTIFICATIONS",
] as const;

export type SnapshotDomain = "PROFILE" | (typeof RICH_DOMAINS)[number];

const snapshotPageSchema = z.looseObject({
  elements: z.array(
    z.looseObject({
      snapshotDomain: z.string(),
      snapshotData: z.array(z.record(z.string(), z.unknown())),
    }),
  ),
  paging: z
    .looseObject({
      links: z
        .array(
          z.looseObject({
            rel: z.string().optional(),
            href: z.string().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});
type SnapshotPage = z.output<typeof snapshotPageSchema>;

const API_BASE_URL = "https://api.linkedin.com/rest";
// The Member Snapshot API documents this version and no other.
const API_VERSION = "202312";
const MAX_PAGES = 1_000;
const MAX_ERROR_LENGTH = 1_000;

/** LinkedIn answers a member without data in a domain with this error. */
function isNoData(body: string): boolean {
  return body.toLowerCase().includes("no data found for this memberid");
}

function nextStart(page: SnapshotPage, start: number): number {
  const next = page.paging?.links?.find((link) => link.rel === "next")?.href;
  const parsed = next
    ? Number(
        new URL(next, "https://api.linkedin.com").searchParams.get("start"),
      )
    : Number.NaN;
  return Number.isInteger(parsed) && parsed > start ? parsed : start + 1;
}

/** Reads the consenting member's data from LinkedIn's DMA Member Snapshot API. */
export class LinkedInClient {
  private readonly accessToken: string;
  private readonly fetchFn: LinkedInFetch;

  constructor(accessToken: string, fetchFn: LinkedInFetch = globalThis.fetch) {
    this.accessToken = accessToken;
    this.fetchFn = fetchFn;
  }

  /** Every PROFILE record, across all pages. */
  fetchProfile(): Promise<LinkedInSnapshotRecord[]> {
    return this.fetchDomain("PROFILE");
  }

  /** Every record of one snapshot domain, across all pages. */
  fetchDomain(domain: SnapshotDomain): Promise<LinkedInSnapshotRecord[]> {
    return this.fetchPages(domain, 0, 0);
  }

  private async fetchPages(
    domain: SnapshotDomain,
    start: number,
    pages: number,
  ): Promise<LinkedInSnapshotRecord[]> {
    if (pages === MAX_PAGES) {
      throw new Error(`LinkedIn snapshot exceeded ${MAX_PAGES} pages`);
    }
    const page = await this.fetchPage(domain, start);
    const records = (page?.elements ?? [])
      .filter((element) => element.snapshotDomain === domain)
      .flatMap((element) => element.snapshotData);
    if (!page || records.length === 0) return records;
    return [
      ...records,
      ...(await this.fetchPages(domain, nextStart(page, start), pages + 1)),
    ];
  }

  /** One page, or null when LinkedIn has no (more) data for the member. */
  private async fetchPage(
    domain: SnapshotDomain,
    start: number,
  ): Promise<SnapshotPage | null> {
    const url = new URL(`${API_BASE_URL}/memberSnapshotData`);
    url.searchParams.set("q", "criteria");
    url.searchParams.set("domain", domain);
    url.searchParams.set("start", String(start));
    const response = await this.fetchFn(url, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Linkedin-Version": API_VERSION,
      },
    });
    if (response.ok) return snapshotPageSchema.parse(await response.json());
    const body = await response.text();
    if (response.status < 500 && isNoData(body)) return null;
    throw new LinkedInApiError(
      response.status,
      body.slice(0, MAX_ERROR_LENGTH),
    );
  }
}

/** A refused or failed snapshot request; `status` is LinkedIn's HTTP status. */
export class LinkedInApiError extends Error {
  readonly status: number;

  constructor(status: number, body: string) {
    super(`LinkedIn snapshot API error: ${status} - ${body}`);
    this.status = status;
    this.name = "LinkedInApiError";
  }
}
