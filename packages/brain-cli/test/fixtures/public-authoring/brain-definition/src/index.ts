import campfire from "@fixture/campfire-interface";
import readingEntities from "@fixture/reading-entities";
import readingInsights from "@fixture/reading-insights";
import readingSite from "@fixture/reading-site";
import readingWebhook from "@fixture/reading-webhook";
import { defineBrain, defineBundle, use } from "@rizom/brain";

// use() creates typed configured definitions; defaults need no empty config object.
const entities = use(readingEntities);
const insights = use(readingInsights, {
  summaryPrefix: "Saved reading",
});
const webhook = use(readingWebhook);
const messages = use(campfire);

// Bundles reference configured definitions, never repeated string identifiers.
const reader = defineBundle({
  id: "reader",
  members: [entities, insights, webhook, messages],
});

// The root package composes capabilities, identity, and the independent site.
export default defineBrain({
  name: "reader",
  identity: {
    characterName: "Reader",
    role: "Reading companion",
    purpose: "Keep saved pages useful and easy to revisit.",
    values: ["curiosity", "clarity"],
  },
  plugins: [entities, insights, webhook, messages],
  bundles: [reader],
  site: readingSite,
});
