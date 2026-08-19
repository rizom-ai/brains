import accountSettingsInterface from "@fixture/mailbox-connection";
import readingEntities from "@fixture/reading-entities";
import readingInsights from "@fixture/reading-insights";
import readingOperator from "@fixture/reading-operator";
import type {
  OperatorCardBlock,
  OperatorColumnsBlock,
  OperatorRegionBlock,
  OperatorViewStatus,
} from "@rizom/brain/services";

const compositionStatus: OperatorViewStatus = {
  label: "Connected",
  detail: "candidate packed contract",
  tone: "good",
};
const compositionCard: OperatorCardBlock<never> = {
  type: "card",
  id: "reading-facts",
  label: "Reading facts",
  blocks: [
    {
      type: "key-values",
      id: "reading-facts-values",
      items: [{ label: "Provider", value: "connected" }],
    },
  ],
};
const compositionRegion: OperatorRegionBlock<never> = compositionCard;
const compositionColumns: OperatorColumnsBlock<never> = {
  type: "columns",
  id: "reading-layout",
  primary: [{ type: "text", id: "reading-work", text: "Review saved work." }],
  aside: [compositionRegion],
};

const installed = [
  accountSettingsInterface,
  readingEntities,
  readingInsights,
  readingOperator,
];

if (
  installed.some((definition) => definition.kind !== "rizom-plugin-package") ||
  readingOperator.family !== "service" ||
  readingOperator.id !== "reading-operator" ||
  accountSettingsInterface.family !== "interface" ||
  compositionStatus.tone !== "good" ||
  compositionColumns.aside[0] !== compositionCard
) {
  throw new Error(
    "Packed Account, Dashboard, and CMS authoring contracts did not compose",
  );
}
