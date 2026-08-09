import campfire from "@fixture/campfire-interface";
import readingEntities from "@fixture/reading-entities";
import readingInsights from "@fixture/reading-insights";
import readingWebhook from "@fixture/reading-webhook";
import { defineBrain, defineBundle, use } from "@rizom/brain";

const entities = use(readingEntities);
const insights = use(readingInsights, {
  summaryPrefix: "Saved reading",
});
const webhook = use(readingWebhook, {
  webhookToken: "packed-interface-secret",
  eventFeedUrl: "http://127.0.0.1:14010/events",
});
const messages = use(campfire, {
  baseUrl: "http://127.0.0.1:14020",
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
