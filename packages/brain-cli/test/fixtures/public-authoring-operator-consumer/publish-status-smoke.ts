import { defineEntity } from "@rizom/brain/entities";
import { defineServicePlugin, defineTool, z } from "@rizom/brain/services";
import { createBrainTestHarness } from "@rizom/brain/testing";

const statuses = ["approved"];
const record = defineEntity({
  type: "approved-record",
  purpose: "Declared publication policy",
  metadata: z.object({ status: z.string().optional() }),
  config: { publish: { publishStatuses: statuses } },
});
const definition = defineServicePlugin(
  { id: "approved-reader", config: z.object({}), entities: [record] },
  {
    tools: () => [
      defineTool({
        name: "read",
        description: "Read configured publication floor",
        input: z.object({}),
        output: z.array(z.string()),
        execute: async ({ entities }) =>
          (
            await entities.listEntities({
              entityType: record.type,
              options: {
                publishedOnly: true,
                filter: { visibilityScope: "public" },
              },
            })
          ).map(({ id }) => id),
      }),
    ],
  },
);
const h = createBrainTestHarness();
try {
  const installed = await h.installPackage(
    definition,
    {},
    { name: "@fixture/approved-reader", version: "0.0.0" },
  );
  statuses.push("draft");
  await h.finalizeRegistration();
  h.addEntities(
    ["approved", "draft", "statusless", "hidden"].map((id) => ({
      id,
      entityType: record.type,
      content: "Body",
      metadata:
        id === "statusless"
          ? {}
          : { status: id === "hidden" ? "approved" : id },
      visibility: id === "hidden" ? "restricted" : "public",
    })),
  );
  const result = await installed.tool("read").call({});
  if (!result.ok || JSON.stringify(result.data) !== '["approved"]')
    throw new Error(
      "Declared publication statuses were lost or widened after installation",
    );
} finally {
  await h.reset();
}
