/**
 * Live end-to-end smoke for the ATProto brain-card discovery path.
 *
 * Exercises the genuinely new Phase 4 code against a real PDS:
 *   1. createSession (credential validation + network)
 *   2. seed a valid nested-schema card into the test repo
 *   3. the publisher's discoverBrainCards → read + validate + dedupe + announce
 *   4. negative case: a stale old-shape card is rejected by the schema
 *   5. re-seed the valid card so the repo is left in a good state
 *
 * Requires (test account only — this writes to the repo's ai.rizom.brain.card/self):
 *   ATPROTO_APP_PASSWORD   app password (required)
 *   ATPROTO_IDENTIFIER     handle/identifier      (default: rizom-test.bsky.social)
 *   ATPROTO_PDS_ENDPOINT   PDS endpoint           (default: https://bsky.social)
 *
 * Run from repo root:
 *   bun plugins/atproto/scripts/smoke-discovery.ts
 */
import {
  canonicalAtprotoLexicons,
  validateAtprotoRecord,
  type AtprotoBrainCardRecord,
} from "@brains/atproto-contracts";
import { createSilentLogger } from "@brains/test-utils";
import { atprotoConfigSchema } from "../src/config";
import { AtprotoPdsClient } from "../src/pds-client";
import {
  createAtprotoPublisher,
  type AtprotoAnnouncer,
  type AtprotoEntityReads,
} from "../src/publisher";
import type { AtprotoBrainSource } from "../src/records";

const PDS_ENDPOINT =
  process.env["ATPROTO_PDS_ENDPOINT"] ?? "https://bsky.social";
const IDENTIFIER =
  process.env["ATPROTO_IDENTIFIER"] ?? "rizom-test.bsky.social";
const APP_PASSWORD = process.env["ATPROTO_APP_PASSWORD"];

const CARD_COLLECTION = "ai.rizom.brain.card";
const CARD_LEXICON = canonicalAtprotoLexicons[CARD_COLLECTION];

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`,
  );
  if (!ok) failures++;
}

function validCard(): AtprotoBrainCardRecord {
  const now = new Date().toISOString();
  return {
    $type: CARD_COLLECTION,
    siteUrl: "https://alex.example.com",
    brain: {
      did: "did:web:alex.example.com",
      name: "Alex (smoke)",
      role: "assistant",
      purpose: "Discovery smoke card for the ATProto Phase 4 read path.",
      values: ["collaboration"],
    },
    anchor: {
      did: "did:web:alex.example.com:anchor",
      name: "Alex",
      category: "person",
      kind: "professional",
    },
    skills: [
      {
        id: "research",
        name: "Research",
        description: "Research topics for collaborators.",
        tags: ["research"],
      },
    ],
    model: "rover",
    version: "0.0.0-smoke",
    createdAt: now,
    updatedAt: now,
  };
}

// Old top-level shape — should fail the nested-schema validation on discovery.
function staleCard(): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    $type: CARD_COLLECTION,
    siteUrl: "https://alex.example.com",
    name: "Alex (stale)",
    description: "Old top-level card shape.",
    a2aEndpoint: "https://alex.example.com/a2a",
    capabilities: [],
    model: "rover",
    version: "0.0.0-stale",
    createdAt: now,
  };
}

async function main(): Promise<void> {
  if (!APP_PASSWORD) {
    console.error(
      "ATPROTO_APP_PASSWORD is not set. Set it in the environment first (test account only).",
    );
    process.exit(2);
  }

  console.log(`PDS:        ${PDS_ENDPOINT}`);
  console.log(`Identifier: ${IDENTIFIER}\n`);

  const client = new AtprotoPdsClient({
    pdsEndpoint: PDS_ENDPOINT,
    identifier: IDENTIFIER,
    appPassword: APP_PASSWORD,
  });

  // 1. credential validation
  let repoDid = "";
  try {
    const session = await client.createSession();
    repoDid = session.did;
    check(
      "createSession (credentials valid)",
      Boolean(session.did),
      session.did,
    );
  } catch (error) {
    check("createSession (credentials valid)", false, String(error));
    console.log("\nCannot continue without a session.");
    process.exit(1);
  }

  // capture what discovery announces
  const events: Array<{ type: string; payload: unknown }> = [];
  const announce: AtprotoAnnouncer = {
    publish: async ({ topic, data }): Promise<void> => {
      events.push({ type: topic, payload: data });
    },
  };
  // Discovery reads the brain's known agents to admit a candidate; this
  // smoke has none, and it never builds a card, so the brain source is unused.
  const entities: AtprotoEntityReads = {
    getEntity: async () => null,
    listEntities: async () => [],
  };
  const brain: AtprotoBrainSource = {
    identity: {
      get: () => {
        throw new Error("smoke does not build a card");
      },
      getProfile: () => {
        throw new Error("smoke does not build a card");
      },
      getAppInfo: async () => ({ model: "smoke", version: "0" }),
    },
    profileKinds: { getResolved: () => undefined },
    publicSkills: { list: async () => [] },
    http: { isConfigured: () => false },
    siteUrl: undefined,
  };

  const publisher = createAtprotoPublisher({
    config: atprotoConfigSchema.parse({
      enabled: true,
      pdsEndpoint: PDS_ENDPOINT,
      identifier: IDENTIFIER,
      appPassword: APP_PASSWORD,
    }),
    brain,
    entities,
    logger: createSilentLogger("smoke-discovery"),
  });

  // 2. seed a valid nested-schema card
  const good = validCard();
  try {
    validateAtprotoRecord(CARD_LEXICON, good); // local contract check before write
    await client.putRecord({
      repo: repoDid,
      collection: CARD_COLLECTION,
      rkey: "self",
      validate: false,
      record: good,
    });
    check("seed valid card (putRecord)", true);
  } catch (error) {
    check("seed valid card (putRecord)", false, String(error));
  }

  // 3. happy-path discovery
  events.length = 0;
  try {
    const result = await publisher.discoverBrainCards(announce, {
      repos: [IDENTIFIER],
    });
    const event = events[0]?.payload as
      { record?: { brain?: { did?: string } } } | undefined;
    check(
      "discover valid card",
      result.discovered === 1 && result.skipped === 0,
      `discovered=${result.discovered} skipped=${result.skipped}`,
    );
    check(
      "discovery emitted brain-card event with nested brain.did",
      events.length === 1 && Boolean(event?.record?.brain?.did),
      event?.record?.brain?.did,
    );
  } catch (error) {
    check("discover valid card", false, String(error));
  }

  // 4. negative case — stale shape rejected
  try {
    await client.putRecord({
      repo: repoDid,
      collection: CARD_COLLECTION,
      rkey: "self",
      validate: false,
      record: staleCard(),
    });
  } catch (error) {
    check("seed stale card (putRecord)", false, String(error));
  }
  events.length = 0;
  try {
    const result = await publisher.discoverBrainCards(announce, {
      repos: [IDENTIFIER],
    });
    const skippedReason = result.results[0]?.error ?? "";
    check(
      "stale card rejected by schema (no event)",
      result.discovered === 0 &&
        result.skipped === 1 &&
        events.length === 0 &&
        /brain/i.test(skippedReason),
      `skipped=${result.skipped} reason="${skippedReason}"`,
    );
  } catch (error) {
    check("stale card rejected by schema (no event)", false, String(error));
  }

  // 5. restore a valid card so the repo is left clean
  try {
    await client.putRecord({
      repo: repoDid,
      collection: CARD_COLLECTION,
      rkey: "self",
      validate: false,
      record: validCard(),
    });
    check("restore valid card", true);
  } catch (error) {
    check("restore valid card", false, String(error));
  }

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
