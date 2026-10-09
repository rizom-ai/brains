import { defineEntity } from "@rizom/brain/entities";
import { defineJob, defineServicePlugin, z } from "@rizom/brain/services";
import { createBrainTestHarness } from "@rizom/brain/testing";

const record = defineEntity({
  type: "record",
  purpose: "Atomic owned records",
  metadata: z.object({ count: z.number() }),
});
const foreign = defineEntity({
  type: "foreign",
  purpose: "Not installed ownership",
  metadata: z.object({}),
});
const mutate = defineJob({
  name: "mutate",
  input: z.object({}),
  output: z.object({ ok: z.literal(true) }),
});
const code = (error: unknown): string | undefined =>
  z.object({ code: z.string() }).safeParse(error).data?.code;
const definition = defineServicePlugin(
  { id: "worker", config: z.object({}), entities: [record] },
  {
    jobs: () => [
      mutate.handle(async ({ entities }) => {
        const candidates = await entities.nearest(record, "one", {
          visibility: "public",
          maxDistance: 0.3,
          limit: 2,
        });
        if (candidates.length !== 0)
          throw new Error("Fixture unexpectedly fabricated semantic distances");
        const nearestDenied = await entities
          .nearest(foreign, "one", {
            visibility: "public",
            maxDistance: 0.3,
            limit: 2,
          })
          .catch((error: unknown): unknown => error);
        if (code(nearestDenied) !== "permission_denied")
          throw new Error("Foreign nearest lookup was accepted");
        const mutations = entities.mutations;
        const operation = mutations.once(record, "capture", "reply");
        const first = await operation.complete({
          operation: "create",
          entity: {
            entityType: "record",
            id: "one",
            content: "one",
            metadata: { count: 1 },
          },
        });
        if (first.operation !== "create" || first.entityId !== "one")
          throw new Error("Missing terminal create");
        const edit = await mutations.read(record, "one");
        if (!edit) throw new Error("Missing issued edit");
        await mutations.replace(record, edit, {
          ...edit.entity,
          metadata: { count: 2 },
        });
        const conflict = await mutations
          .replace(record, edit, edit.entity)
          .catch((error: unknown): unknown => error);
        if (code(conflict) !== "conflict")
          throw new Error("Stale edit was accepted");
        await entities.create(record, {
          id: "two",
          content: "two",
          metadata: { count: 3 },
        });
        const source = await mutations.read(record, "two");
        const target = await mutations.read(record, "one");
        if (!source || !target) throw new Error("Missing pair");
        await mutations.fold(record, source, target, {
          ...target.entity,
          metadata: {
            count: source.entity.metadata.count + target.entity.metadata.count,
          },
        });
        if (await mutations.read(record, "two"))
          throw new Error("Source survived fold");
        if ((await mutations.read(record, "one"))?.entity.metadata.count !== 5)
          throw new Error("Wrong folded count");
        const staleRemoval = await mutations
          .remove(record, target)
          .catch((error: unknown): unknown => error);
        if (code(staleRemoval) !== "conflict")
          throw new Error("Stale removal was accepted");
        const current = await mutations.read(record, "one");
        if (!current) throw new Error("Missing current snapshot");
        await mutations.remove(record, current);
        if (await mutations.read(record, "one"))
          throw new Error("Conditional removal did not delete its target");
        const policy = entities.getSourcePolicy(record.type);
        if (
          !Object.isFrozen(policy) ||
          !policy.projectionSource ||
          policy.projectionSourceRole !== "primary"
        )
          throw new Error("Invalid detached source policy");
        const repeated = await operation.complete({ operation: "none" });
        if (repeated.operation !== "create" || repeated.entityId !== "one")
          throw new Error("Deletion lost receipt");
        const denied = await mutations
          .read(foreign, "one")
          .catch((error: unknown): unknown => error);
        if (code(denied) !== "permission_denied")
          throw new Error("Foreign ownership was accepted");
        return { ok: true };
      }),
    ],
  },
);
const harness = createBrainTestHarness();
try {
  const installed = await harness.installPackage(
    definition,
    {},
    { name: "@fixture/owned-mutations", version: "0.0.0" },
  );
  const job = installed.jobs.find((job) => job.localName === "mutate");
  if (!job) throw new Error("Missing declared job");
  if (!z.object({ ok: z.literal(true) }).safeParse(await job.run({})).success)
    throw new Error("Invalid mutation result");
} finally {
  await harness.reset();
}
