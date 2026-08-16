import accountSettingsInterface from "@fixture/mailbox-connection";
import readingEntities from "@fixture/reading-entities";
import readingInsights from "@fixture/reading-insights";
import readingOperator from "@fixture/reading-operator";

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
  accountSettingsInterface.family !== "interface"
) {
  throw new Error(
    "Packed Account, Dashboard, and CMS authoring contracts did not compose",
  );
}
