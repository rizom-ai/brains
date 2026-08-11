import reader from "@fixture/reader-brain";

if (reader.name !== "reader" || reader.plugins.length !== 4) {
  throw new Error(
    "Published authoring packages did not compose the reader brain",
  );
}
