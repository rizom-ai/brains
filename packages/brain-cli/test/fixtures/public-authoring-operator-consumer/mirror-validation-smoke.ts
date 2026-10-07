import { defineEntity } from "@rizom/brain/entities";
import { defineServicePlugin, infrastructure, z } from "@rizom/brain/services";
import type { EntityMirrorClient } from "@rizom/brain/plugins";
import { createBrainTestHarness } from "@rizom/brain/testing";

const record = defineEntity({
  type: "mirror-validation-record",
  purpose: "Outside-author validation classification canary",
  metadata: z.object({ requiredTag: z.string() }),
  validatePersist({ content }) {
    if (content.includes("POLICY_BLOCKED"))
      z.literal("allowed").parse("blocked");
  },
});
let mirror: EntityMirrorClient | undefined;
const definition = defineServicePlugin({
  id: "mirror-validation",
  config: z.object({}),
  entities: [record],
  infrastructure,
  setup({ infrastructure: facts }) {
    mirror = facts.entityMirror;
    return {};
  },
});
const h = createBrainTestHarness();
try {
  await h.installPackage(
    definition,
    {},
    { name: "@fixture/mirror-validation", version: "0.0.0" },
  );
  await h.finalizeRegistration();
  if (!mirror) throw new Error("Missing declared mirror capability");
  const entity = {
    entityType: record.type,
    id: "one",
    content: "PRIVATE_SOURCE_MARKER",
    metadata: {},
    visibility: "public" as const,
    contentHash: "fixture-hash",
    created: "2026-07-01T00:00:00.000Z",
    updated: "2026-07-01T00:00:00.000Z",
  };
  for (const [candidate, code] of [
    [entity, "invalid_input"],
    [
      {
        ...entity,
        content: "POLICY_BLOCKED",
        metadata: { requiredTag: "present" },
      },
      "handler_failed",
    ],
  ] as const) {
    const result = await mirror
      .upsertEntity({ entity: candidate })
      .catch((error: unknown) => error);
    // Diagnostic causes remain local under the existing SdkError contract;
    // published errors must contain only the safe code and message.
    const serialized = JSON.stringify(result);
    const published = z
      .strictObject({ code: z.literal(code), message: z.string() })
      .safeParse(JSON.parse(serialized));
    if (!published.success || serialized.includes("PRIVATE_SOURCE_MARKER"))
      throw new Error(
        `Mirror did not preserve sanitized ${code} classification`,
      );
    if (await h.getEntity(record.type, "one"))
      throw new Error("Refused import was stored");
  }
  await mirror.upsertEntity({
    entity: {
      ...entity,
      content: "Allowed",
      metadata: { requiredTag: "present" },
    },
  });
  if (!(await h.getEntity(record.type, "one")))
    throw new Error("Valid import was not stored");
} finally {
  await h.reset();
}
