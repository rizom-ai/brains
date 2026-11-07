import readingEntities from "@fixture/reading-entities";
import readingInsights from "@fixture/reading-insights";
import readerImport from "@fixture/reader-import";
import readerProfile from "@fixture/reader-profile";
import { defineBrain, defineBundle, use } from "@rizom/brain";

const entities = use(readingEntities);
const insights = use(readingInsights, {
  summaryPrefix: "Saved reading",
});
// The profile package stewards the reader's profile and admits the importer.
const profile = use(readerProfile, {
  importers: ["@fixture/reader-import:reader-import"],
});
const importer = use(readerImport);
const core = defineBundle({
  id: "core",
  members: [entities, insights, profile, importer],
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
  plugins: [entities, insights, profile, importer],
  bundles: [core],
  // The steward writes the profile as itself when an importer asks, so the
  // brain grants that package what writing the type requires.
  permissions: {
    rules: [
      { pattern: "service:@fixture/reader-profile:profile", level: "admin" },
    ],
  },
});
