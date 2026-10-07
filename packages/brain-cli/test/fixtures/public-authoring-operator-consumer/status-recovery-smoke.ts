import assert from "node:assert/strict";
import { createBrainTestHarness } from "@rizom/brain/testing";
import {
  defineServicePlugin,
  SerializedStatusStore,
  z,
} from "@rizom/brain/services";

const schema = z.object({
  total: z.number().int().nonnegative(),
  notes: z.array(z.string()),
});
const empty = (): z.output<typeof schema> => ({ total: 0, notes: [] });
const h = createBrainTestHarness();
try {
  await h.installPackage(
    defineServicePlugin({
      id: "status-recovery",
      config: z.object({}),
      setup: async ({ runtimeState }) => {
        const store = new SerializedStatusStore({
          runtimeState: { scoped: runtimeState },
          namespace: "status",
          schema,
          createEmpty: empty,
        });
        const disk = runtimeState({ namespace: "status", schema });
        await store.mutate((state) => {
          state.total = 1;
        });
        await assert.rejects(
          store.mutate((state) => {
            state.total = -1;
          }),
        );
        assert.deepEqual(await store.snapshot(), { total: 1, notes: [] });
        await assert.rejects(
          store.mutate((state) => {
            state.notes.push("failed mutation");
            throw new Error("mutation failed");
          }),
        );
        const returned = await store.mutate((state) => {
          state.total += 1;
          return state.notes;
        });
        returned.push("outside mutation");
        assert.deepEqual(await store.snapshot(), { total: 2, notes: [] });
        assert.deepEqual(await disk.get("current"), { total: 2, notes: [] });

        const raw = runtimeState({ namespace: "retry", schema: z.unknown() });
        await raw.set("current", { total: "invalid", notes: [] });
        const retry = new SerializedStatusStore({
          runtimeState: { scoped: runtimeState },
          namespace: "retry",
          schema,
          createEmpty: empty,
        });
        await assert.rejects(retry.snapshot());
        await raw.set("current", { total: 4, notes: [] });
        await retry.mutate((state) => {
          state.total += 1;
        });
        assert.deepEqual(await retry.snapshot(), { total: 5, notes: [] });
        assert.deepEqual(await raw.get("current"), { total: 5, notes: [] });
        return {};
      },
    }),
    {},
    { name: "@fixture/status-recovery", version: "0.0.0" },
  );
  await h.finalizeRegistration();
} finally {
  await h.reset();
}
