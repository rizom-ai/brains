import { z } from "@brains/utils/zod";

export type LinkedInFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;
export type LinkedInSnapshotRecord = Record<string, unknown>;

export const linkedinRichProfessionalSnapshotDomains: readonly [
  "POSITIONS",
  "EDUCATION",
  "SKILLS",
  "CERTIFICATIONS",
] = ["POSITIONS", "EDUCATION", "SKILLS", "CERTIFICATIONS"];

export const linkedinProfessionalSnapshotDomainSchema: z.ZodEnum<{
  PROFILE: "PROFILE";
  POSITIONS: "POSITIONS";
  EDUCATION: "EDUCATION";
  SKILLS: "SKILLS";
  CERTIFICATIONS: "CERTIFICATIONS";
}> = z.enum(["PROFILE", "POSITIONS", "EDUCATION", "SKILLS", "CERTIFICATIONS"]);

export type LinkedInProfessionalSnapshotDomain = z.output<
  typeof linkedinProfessionalSnapshotDomainSchema
>;

interface LinkedInSnapshotPage {
  elements: Array<{
    snapshotDomain: string;
    snapshotData: LinkedInSnapshotRecord[];
  }>;
  paging?:
    | {
        start?: number | undefined;
        links?:
          | Array<{
              rel?: string | undefined;
              href?: string | undefined;
            }>
          | undefined;
      }
    | undefined;
}

const snapshotRecordSchema = z.record(z.string(), z.unknown());

const snapshotPageSchema: z.ZodType<LinkedInSnapshotPage> = z.looseObject({
  elements: z.array(
    z.looseObject({
      snapshotDomain: z.string(),
      snapshotData: z.array(snapshotRecordSchema),
    }),
  ),
  paging: z
    .looseObject({
      start: z.number().int().nonnegative().optional(),
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

const API_BASE_URL = "https://api.linkedin.com/rest";
const API_VERSION = "202312";
const MAX_SNAPSHOT_PAGES = 1_000;
const MAX_ERROR_LENGTH = 1_000;

function isNoDataResponse(body: string): boolean {
  return body.toLowerCase().includes("no data found for this memberid");
}

function truncateErrorBody(body: string): string {
  return body.slice(0, MAX_ERROR_LENGTH);
}

function getNextStart(
  page: LinkedInSnapshotPage,
  currentStart: number,
): number {
  const nextHref = page.paging?.links?.find(
    (link) => link.rel === "next",
  )?.href;
  if (nextHref) {
    const nextUrl = new URL(nextHref, "https://api.linkedin.com");
    const parsedStart = Number(nextUrl.searchParams.get("start"));
    if (Number.isInteger(parsedStart) && parsedStart >= 0) return parsedStart;
  }
  return currentStart + 1;
}

/** Client for LinkedIn's DMA Member Snapshot API. */
export class LinkedInClient {
  private readonly accessToken: string;
  private readonly fetchFn: LinkedInFetch;

  constructor(accessToken: string, fetchFn: LinkedInFetch = globalThis.fetch) {
    this.accessToken = accessToken;
    this.fetchFn = fetchFn;
  }

  /** Fetch all PROFILE snapshot pages for the consenting member. */
  async fetchProfile(): Promise<LinkedInSnapshotRecord[]> {
    return this.fetchDomain("PROFILE");
  }

  /** Fetch every page for one supported professional snapshot domain. */
  async fetchDomain(
    domain: LinkedInProfessionalSnapshotDomain,
  ): Promise<LinkedInSnapshotRecord[]> {
    const records: LinkedInSnapshotRecord[] = [];
    let start = 0;

    for (let pageCount = 0; pageCount < MAX_SNAPSHOT_PAGES; pageCount += 1) {
      const url = new URL(`${API_BASE_URL}/memberSnapshotData`);
      url.searchParams.set("q", "criteria");
      url.searchParams.set("domain", domain);
      url.searchParams.set("start", String(start));

      const response = await this.fetchFn(url, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Linkedin-Version": API_VERSION,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const body = await response.text();
        if (response.status < 500 && isNoDataResponse(body)) return records;
        throw new Error(
          `LinkedIn snapshot API error: ${response.status} - ${truncateErrorBody(body)}`,
        );
      }

      const page = snapshotPageSchema.parse(await response.json());
      const domainElements = page.elements.filter(
        (element) => element.snapshotDomain === domain,
      );
      const pageRecords = domainElements.flatMap(
        (element) => element.snapshotData,
      );
      records.push(...pageRecords);

      if (pageRecords.length === 0) return records;
      start = getNextStart(page, start);
    }

    throw new Error(
      `LinkedIn snapshot pagination exceeded ${MAX_SNAPSHOT_PAGES} pages`,
    );
  }
}
