import reader from "@fixture/reader-brain";
import readingOperator from "@fixture/reading-operator";

if (
  readingOperator.family !== "service" ||
  readingOperator.id !== "reading-operator"
) {
  throw new Error(
    "Packed Account, Dashboard, and CMS authoring did not import together",
  );
}

if (reader.name !== "reader" || reader.plugins.length !== 4) {
  throw new Error(
    "Published authoring packages did not compose the reader brain",
  );
}
