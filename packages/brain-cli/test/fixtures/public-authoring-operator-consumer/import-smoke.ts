import accountSettingsInterface from "@fixture/mailbox-connection";
import readingEntities from "@fixture/reading-entities";
import readingInsights, {
  readingRequest,
  readingRequestCount,
} from "@fixture/reading-insights";
import { createBrainTestHarness } from "@rizom/brain/testing";
import readingOperator from "@fixture/reading-operator";
import type {
  OperatorCardBlock,
  OperatorColumnsBlock,
  OperatorRegionBlock,
  OperatorViewBlock,
  OperatorViewStatus,
} from "@rizom/brain/services";

const harness = createBrainTestHarness();
try {
  const service = await harness.installPackage(readingInsights);
  await harness.finalizeRegistration();
  const tool = service.tool("record-reading-request");
  const answer = await tool.call({ bookmarkId: "fixture-bookmark" });
  if (!answer.ok) {
    throw new Error("Recording the service's own type failed", {
      cause: "cause" in answer ? answer.cause : answer,
    });
  }
  const data = answer.data;
  if (
    data === null ||
    typeof data !== "object" ||
    !("id" in data) ||
    typeof data.id !== "string"
  ) {
    throw new Error("The recording tool did not return an id");
  }
  const stored = await harness.getEntity(readingRequest.type, data.id);
  if (
    stored?.metadata === null ||
    typeof stored?.metadata !== "object" ||
    !("bookmarkId" in stored.metadata) ||
    stored.metadata.bookmarkId !== "fixture-bookmark"
  ) {
    throw new Error("The golden service did not persist its owned entity");
  }
  const routed = await harness.fetch("GET", "/reading-requests");
  if (JSON.stringify(routed) !== JSON.stringify({ ids: [data.id] })) {
    throw new Error("The service route did not read its owned entity");
  }
  const counted = await harness.request(readingRequestCount, {});
  if (!counted.ok || counted.data.count !== 1) {
    throw new Error("The exported subscription did not answer across packages");
  }
} finally {
  await harness.reset();
}

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
const compactCollection: OperatorViewBlock<never> = {
  type: "table",
  id: "reading-items",
  empty: "No reading items.",
  query: {
    controls: [
      {
        key: "tag",
        label: "Tag",
        allLabel: "All tags",
        options: [{ value: "systems", label: "Systems" }],
      },
    ],
    pagination: { offset: 0, limit: 25, total: 1, label: "items" },
  },
  columns: [{ key: "title", label: "Title" }],
  rows: [
    {
      id: "item-1",
      cells: { title: "A systems reader" },
      compact: {
        title: "A systems reader",
        metadata: ["systems", "12 minutes"],
        badges: [{ label: "saved", tone: "neutral" }],
      },
    },
  ],
};
const compactTitle = compactCollection.rows[0]?.compact?.title;

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
  compositionColumns.aside[0] !== compositionCard ||
  compactTitle !== "A systems reader"
) {
  throw new Error(
    "Packed Account, Dashboard, and Studio authoring contracts did not compose",
  );
}
