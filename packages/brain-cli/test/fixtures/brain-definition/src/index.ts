import readingEntities from "@fixture/reading-entities";
import { defineBrain, defineBundle, use } from "@rizom/brain";

const entities = use(readingEntities);
const core = defineBundle({
  id: "core",
  members: [entities],
});

export default defineBrain({
  name: "fixture-brain",
  model: "gpt-5.6-luna",
  identity: {
    characterName: "Fixture",
    role: "Compile fixture",
    purpose: "Prove root public brain definition types",
    values: ["stability"],
  },
  plugins: [entities],
  bundles: [core],
});
