import campfire from "@fixture/campfire-interface";
import readingEntities from "@fixture/reading-entities";
import readingInsights from "@fixture/reading-insights";
import readingWebhook from "@fixture/reading-webhook";
import { defineBrain, defineBundle, use } from "@rizom/brain";

// This fixture compiles with only @rizom/brain types — no @types/node — because
// that is part of what it proves. Read the environment structurally so the test
// can inject OS-assigned transport ports without adding a dependency.
const fixtureEnv =
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- this fixture compiles without @types/node on purpose, so `process` has no declared type to narrow
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env ?? {};

const entities = use(readingEntities);
const insights = use(readingInsights, {
  summaryPrefix: "Saved reading",
});
const webhook = use(readingWebhook, {
  webhookToken: "packed-interface-secret",
  // Supplied by the test so it can bind an OS-assigned port; the literal
  // keeps this fixture runnable on its own.
  eventFeedUrl:
    fixtureEnv["FIXTURE_EVENT_FEED_URL"] ?? "http://127.0.0.1:14010/events",
});
const messages = use(campfire, {
  baseUrl: fixtureEnv["FIXTURE_CAMPFIRE_BASE_URL"] ?? "http://127.0.0.1:14020",
  workspace: "packed-reading-club",
  token: "packed-campfire-secret",
});
const core = defineBundle({
  id: "core",
  members: [entities, insights, webhook, messages],
});

export default defineBrain({
  name: "interface-fixture-brain",
  model: "gpt-5.6-luna",
  identity: {
    characterName: "Interface Fixture",
    role: "Receive reading events",
    purpose: "Prove declarative interface lifecycle and routing",
    values: ["trust"],
  },
  plugins: [entities, insights, webhook, messages],
  bundles: [core],
  permissions: {
    admins: ["reading-webhook:packed-reader"],
    anchors: ["reading-webhook:packed-reader"],
  },
});
