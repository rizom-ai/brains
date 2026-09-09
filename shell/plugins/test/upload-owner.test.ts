import { describe, expect, it } from "bun:test";
import { createTestDirectory } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import {
  defineInterface,
  defineMessageInterface,
  instantiatePluginPackageDefinition,
} from "../src";
import { uploadNamespaceFor } from "../src/internal/state-namespace";
import {
  RuntimeUploadRegistry,
  type ScopedRuntimeUploadStore,
} from "../src/service/upload-registry";
import { createPluginHarness } from "../src/test/harness";

const uploadId = "upload-00000000-0000-4000-8000-000000000001";
const legacyId = "upload-00000000-0000-4000-8000-000000000002";
const scope = {
  namespace: "upload",
  refKind: "upload",
  routePath: "/uploads",
  createId: (): string => uploadId,
};

async function expectMissing(
  store: ScopedRuntimeUploadStore,
  id: string,
): Promise<void> {
  const error = await store.read(id).then(
    () => null,
    (failure: unknown) => failure,
  );
  expect(error).toMatchObject({ code: "not_found" });
}

describe("upload namespace ownership", () => {
  it("uses every owner component in a bounded flat directory name", () => {
    const cases = [
      ["@scope/pkg", "same", "upload"],
      ["scope.pkg", "same", "upload"],
      ["@scope/other", "same", "upload"],
      ["@scope/pkg", "other", "upload"],
      ["@scope/pkg", "same", "other"],
      ["@scope/pkg", "same.part", "upload"],
      ["@scope/pkg", "same", "part.upload"],
      [`@scope/${"long".repeat(100)}`, "same", "upload"],
      ["@scope/pkg", "same", "long".repeat(100)],
    ] as const;
    const names = cases.map(([owner, id, local]) =>
      uploadNamespaceFor(owner, id, local),
    );
    expect(new Set(names).size).toBe(cases.length);
    for (const name of names) {
      expect(name).toMatch(/^interface-upload-[a-f0-9]{64}$/u);
      expect(Buffer.byteLength(name)).toBeLessThan(255);
      expect(name).not.toContain(".");
    }
    expect(names[0]).toBe(uploadNamespaceFor(...cases[0]));
    for (const local of ["../escape", "nested/file", "nested\\file"]) {
      expect(() => uploadNamespaceFor("@scope/pkg", "same", local)).toThrow(
        "flat path segment",
      );
    }
    expect(() => uploadNamespaceFor("\ud800", "same", "upload")).toThrow(
      "well-formed",
    );
    expect(() => uploadNamespaceFor("", "same", "upload")).toThrow();
  });

  for (const firstFamily of ["interface", "message-interface"] as const) {
    for (const secondFamily of ["interface", "message-interface"] as const) {
      it(`isolates save/read/remove/prune and restart for ${firstFamily}/${secondFamily} owners`, async () => {
        const directory = await createTestDirectory();
        let harness = createPluginHarness({ dataDir: directory.dir });
        const stores = new Map<string, ScopedRuntimeUploadStore>();
        const pruners = new Map<string, ScopedRuntimeUploadStore>();
        const definition = (
          family: typeof firstFamily,
          label: string,
        ):
          | ReturnType<typeof defineInterface>
          | ReturnType<typeof defineMessageInterface> => {
          const setup = ({
            uploads,
          }: {
            uploads: (
              options: typeof scope & { maxCount?: number },
            ) => ScopedRuntimeUploadStore;
          }): Record<string, never> => {
            stores.set(label, uploads(scope));
            pruners.set(label, uploads({ ...scope, maxCount: 0 }));
            return {};
          };
          return family === "interface"
            ? defineInterface(
                { id: "same-id", config: z.object({}), setup },
                {},
              )
            : defineMessageInterface(
                {
                  id: "same-id",
                  config: z.object({}),
                  setup,
                  channel: {
                    type: label,
                    displayName: label,
                    subjectLabel: "Recipient",
                    recipient: z.string(),
                  },
                },
                { send: () => "unused" },
              );
        };
        const install = async (
          family: typeof firstFamily,
          label: string,
        ): Promise<void> => {
          const [plugin] = instantiatePluginPackageDefinition(
            definition(family, label),
            {},
            { name: `@fixture/${label}`, version: "0.1.0" },
          );
          if (!plugin) throw new Error("Missing upload interface");
          await harness.installPlugin(plugin);
        };
        try {
          const legacy = RuntimeUploadRegistry.createFresh({
            dataDir: directory.dir,
          }).scoped({
            ...scope,
            namespace: "same-id.upload",
            createId: () => legacyId,
          });
          await legacy.save({
            filename: "legacy.txt",
            mediaType: "text/plain",
            content: Buffer.from("old temporary upload"),
          });
          await install(firstFamily, "first");
          await install(secondFamily, "second");
          await harness.finalizeRegistration();
          const first = stores.get("first");
          const second = stores.get("second");
          const pruner = pruners.get("second");
          if (!first || !second || !pruner)
            throw new Error("Missing upload stores");
          await expectMissing(first, legacyId);
          await expectMissing(second, legacyId);
          const saved = await first.save({
            filename: "first.txt",
            mediaType: "text/plain",
            content: Buffer.from("first"),
          });
          expect(saved.ref).toEqual({ kind: "upload", id: uploadId });
          expect(first.toResponseBody(saved).url).toBe(
            `/uploads?id=${uploadId}`,
          );
          await expectMissing(second, uploadId);
          await second.save({
            filename: "second.txt",
            mediaType: "text/plain",
            content: Buffer.from("second"),
          });
          expect(first.getUploadDir(uploadId)).not.toBe(
            second.getUploadDir(uploadId),
          );
          expect((await first.read(uploadId)).content.toString()).toBe("first");
          expect((await second.read(uploadId)).content.toString()).toBe(
            "second",
          );
          await second.remove(uploadId);
          expect((await first.read(uploadId)).content.toString()).toBe("first");
          await expectMissing(second, uploadId);
          await second.save({
            filename: "second.txt",
            mediaType: "text/plain",
            content: Buffer.from("second"),
          });
          await pruner.prune();
          await expectMissing(second, uploadId);
          expect((await first.read(uploadId)).content.toString()).toBe("first");
          expect((await legacy.read(legacyId)).content.toString()).toBe(
            "old temporary upload",
          );
          await harness.reset();
          harness = createPluginHarness({ dataDir: directory.dir });
          await install(firstFamily, "first");
          await install(secondFamily, "second");
          await harness.finalizeRegistration();
          const reopened = stores.get("first");
          const reopenedSecond = stores.get("second");
          if (!reopened || !reopenedSecond)
            throw new Error("Missing restarted stores");
          expect((await reopened.read(uploadId)).content.toString()).toBe(
            "first",
          );
          await expectMissing(reopened, legacyId);
          await expectMissing(reopenedSecond, uploadId);
        } finally {
          try {
            await harness.reset();
          } finally {
            await directory.cleanup();
          }
        }
      });
    }
  }
});
