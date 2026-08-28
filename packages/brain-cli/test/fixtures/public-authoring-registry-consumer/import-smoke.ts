import mailboxConnection from "@fixture/mailbox-connection";
import reader from "@fixture/reader-brain";
import readingOperator from "@fixture/reading-operator";

if (
  readingOperator.family !== "service" ||
  readingOperator.id !== "reading-operator"
) {
  throw new Error(
    "Packed Account, Dashboard, and Studio authoring did not import together",
  );
}

if (
  mailboxConnection.family !== "interface" ||
  mailboxConnection.id !== "mailbox-connection"
) {
  throw new Error(
    "Packed interface-family account settings did not import from the published contract",
  );
}

if (reader.name !== "reader" || reader.plugins.length !== 4) {
  throw new Error(
    "Published authoring packages did not compose the reader brain",
  );
}
