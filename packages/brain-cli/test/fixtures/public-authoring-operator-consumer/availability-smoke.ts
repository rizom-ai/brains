import { createBrainTestHarness } from "@rizom/brain/testing";
import {
  defineInterface,
  type InterfaceAvailabilityWriter,
} from "@rizom/brain/interfaces";
import {
  defineServicePlugin,
  z,
  type InterfaceAvailabilityReader,
  type InterfaceAvailabilityOwner,
} from "@rizom/brain/services";

const harness = createBrainTestHarness();
const owner: InterfaceAvailabilityOwner = {
  packageName: "@fixture/availability",
  declarationId: "browser",
};
const writers: InterfaceAvailabilityWriter[] = [];
const readers: InterfaceAvailabilityReader[] = [];
function authorityShapes(
  writer: InterfaceAvailabilityWriter,
  reader: InterfaceAvailabilityReader,
): void {
  // @ts-expect-error Readers cannot publish another interface's flags.
  void reader.set({ public: true, preview: true });
  void writer.set({
    public: true,
    preview: true,
    // @ts-expect-error Writers cannot select another owner.
    packageName: "@foreign/owner",
  });
  // @ts-expect-error Readers never expose private storage namespaces.
  void reader.scoped({ namespace: "private" });
}
void authorityShapes;
try {
  await harness.installPackage(
    defineInterface(
      {
        id: "browser",
        config: z.strictObject({}),
        setup: async ({ availability }) => {
          writers.push(availability);
          await availability.set({ public: true, preview: false });
          return {};
        },
      },
      {},
    ),
    {},
    { name: owner.packageName, version: "0.0.0" },
  );
  await harness.installPackage(
    defineServicePlugin(
      {
        id: "reader",
        config: z.strictObject({}),
        setup: ({ interfaceAvailability }) => {
          readers.push(interfaceAvailability);
          return {};
        },
      },
      {},
    ),
    {},
    { name: "@fixture/site-reader", version: "0.0.0" },
  );
  const writer = writers.at(0);
  const reader = readers.at(0);
  if (!writer || !reader) throw new Error("Missing availability capabilities");
  const value = await reader.get(owner);
  if (
    !value?.public ||
    value.preview ||
    !Object.isFrozen(value) ||
    !Object.isFrozen(writer) ||
    !Object.isFrozen(reader)
  )
    throw new Error("Availability contract failed");
  const extra = { public: true, preview: true, namespace: "private" };
  const refused: unknown = await writer
    .set(extra)
    .catch((error: unknown) => error);
  if (
    typeof refused !== "object" ||
    refused === null ||
    !("code" in refused) ||
    refused.code !== "invalid_input"
  )
    throw new Error("Availability accepted extra authority");
  if ((await reader.get({ ...owner, packageName: "@fixture/other" })) !== null)
    throw new Error("Availability crossed owners");
  await writer.set({ public: false, preview: true });
  if (
    JSON.stringify(value) !==
      JSON.stringify({ public: true, preview: false }) ||
    !(await reader.get(owner))?.preview
  )
    throw new Error("Availability snapshots alias live state");
} finally {
  await harness.reset();
}
