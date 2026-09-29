import { createBrainTestHarness } from "@rizom/brain/testing";
import {
  defineRoute,
  defineServicePlugin,
  z,
  type InterfaceCaller,
  type OperatorEntityWrites,
  type OperatorEntityGroupings,
} from "@rizom/brain/services";

const harness = createBrainTestHarness();
let capabilities:
  { writes: OperatorEntityWrites; groups: OperatorEntityGroupings } | undefined;
let retained: InterfaceCaller | undefined;
const definition = defineServicePlugin(
  {
    id: "caller-authority-probe",
    config: z.object({}),
    setup: ({ operatorEntities, entityGroupings }) => {
      capabilities = { writes: operatorEntities, groups: entityGroupings };
      return capabilities;
    },
  },
  {
    routes: ({ state }) => [
      defineRoute({
        method: "GET",
        path: "/caller-authority-probe",
        security: { kind: "protocol", authenticate: () => ({ id: "fixture" }) },
        response: z.object({ ok: z.boolean() }),
        handle: async ({ caller }) => {
          retained = caller;
          await state.groups.definitions(caller);
          return { ok: true };
        },
      }),
    ],
  },
);
async function denied(operation: () => Promise<unknown>): Promise<void> {
  const result: unknown = await operation().catch((error: unknown) => error);
  if (
    typeof result !== "object" ||
    result === null ||
    !("code" in result) ||
    result.code !== "unauthenticated"
  ) {
    throw new Error("Operator capability accepted an unverified caller");
  }
}
try {
  await harness.installPackage(definition);
  await harness.finalizeRegistration();
  if (!capabilities) throw new Error("Setup did not run");
  const { writes, groups } = capabilities;
  const forged: InterfaceCaller = {
    actor: { id: "forged" },
    permission: "admin",
    isAnchor: true,
  };
  await denied(() => groups.definitions(forged));
  await denied(() =>
    writes.create(
      {
        entityType: "foreign",
        entity: {
          entityType: "foreign",
          id: "one",
          content: "Body",
          metadata: {},
        },
      },
      forged,
    ),
  );
  const response = await harness.fetch("GET", "/caller-authority-probe");
  if (JSON.stringify(response) !== JSON.stringify({ ok: true }) || !retained)
    throw new Error("Runtime-issued caller did not work");
  const expired = retained;
  await denied(() => groups.definitions(expired));
  if (!Object.isFrozen(writes))
    throw new Error("Operator namespace is mutable");
} finally {
  await harness.reset();
}
