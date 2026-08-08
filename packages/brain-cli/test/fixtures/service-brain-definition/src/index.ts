import readingEntities from "@fixture/reading-entities";
import readingInsights from "@fixture/reading-insights";
import { defineBrain, defineBundle, use } from "@rizom/brain";

const entities = use(readingEntities);
const insights = use(readingInsights, {
  summaryPrefix: "Saved reading",
});
const core = defineBundle({
  id: "core",
  members: [entities, insights],
});

export default defineBrain({
  name: "service-fixture-brain",
  model: "gpt-5.6-luna",
  identity: {
    characterName: "Service Fixture",
    role: "Compile reading digests",
    purpose: "Prove declarative service and durable job behavior",
    values: ["durability"],
  },
  plugins: [entities, insights],
  bundles: [core],
});
