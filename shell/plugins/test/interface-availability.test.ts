import { describe, expect, it, spyOn } from "bun:test";
import { z } from "@brains/utils/zod";
import { sha256Hex } from "@brains/utils/hash";
import { createSilentLogger } from "@brains/test-utils";
import { RuntimeStateService } from "@brains/runtime-state";
import { migrateRuntimeState } from "@brains/runtime-state/migrate";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  defineInterface,
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  createServicePluginContext,
  type InterfaceAvailabilityWriter,
  type InterfaceAvailabilityReader,
} from "../src";
import {
  createPluginHarness,
  createMemoryRuntimeStateNamespace,
} from "../test";
import {
  createInterfaceAvailabilityReader,
  createInterfaceAvailabilityWriter,
} from "../src/internal/interface-availability";
import { operatorValidationCause } from "../src/service/operator-validation";

const owner = { packageName: "@fixture/web", declarationId: "browser" };
describe("durable public interface availability", () => {
  it("survives writer shutdown and a fresh SQLite connection without interfaces", async () => {
    const directory = await mkdtemp(join(tmpdir(), "interface-availability-"));
    const url = `file:${join(directory, "state.db")}`;
    let web: RuntimeStateService | undefined;
    let worker: RuntimeStateService | undefined;
    try {
      await migrateRuntimeState({ url });
      web = RuntimeStateService.createFresh({ url });
      await createInterfaceAvailabilityWriter(web, owner).set({
        public: false,
        preview: true,
      });
      web.close();
      web = undefined;
      worker = RuntimeStateService.createFresh({ url });
      const reader = createInterfaceAvailabilityReader(worker);
      expect(await reader.get(owner)).toEqual({ public: false, preview: true });
      expect(await reader.get({ ...owner, declarationId: "other" })).toBeNull();
    } finally {
      web?.close();
      worker?.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("binds the writer to the installed owner and exposes only reads in a worker", async () => {
    const web = createPluginHarness({
      logger: createSilentLogger("availability-web"),
    });
    const worker = createPluginHarness({
      logger: createSilentLogger("availability-worker"),
    });
    let writer: InterfaceAvailabilityWriter | undefined;
    let reader: InterfaceAvailabilityReader | undefined;
    let cleanupConsumer: (() => Promise<void>) | undefined;
    try {
      spyOn(worker.getMockShell(), "getRuntimeState").mockReturnValue(
        web.getMockShell().getRuntimeState(),
      );
      const [producer] = instantiatePluginPackageDefinition(
        defineInterface(
          {
            id: owner.declarationId,
            config: z.strictObject({}),
            setup: async (context) => {
              writer = context.availability;
              await context
                .runtimeState({ namespace: "private", schema: z.unknown() })
                .set("availability", { secret: "PRIVATE" });
              await writer.set({ public: true, preview: false });
              return {};
            },
          },
          {},
        ),
        {},
        { name: owner.packageName, version: "0.0.0" },
      );
      if (!producer) throw new Error("Missing producer");
      await web.installPlugin(producer);
      const [consumer] = instantiatePluginPackageDefinition(
        defineServicePlugin(
          {
            id: "site",
            config: z.strictObject({}),
            setup: (context) => {
              reader = context.interfaceAvailability;
              return {};
            },
          },
          {},
        ),
        {},
        { name: "@fixture/site", version: "0.0.0" },
      );
      if (!consumer) throw new Error("Missing consumer");
      cleanupConsumer = async (): Promise<void> => {
        await consumer.shutdown?.();
      };
      await consumer.register(worker.getMockShell(), { executionOnly: true });
      if (!reader || !writer) throw new Error("Missing capabilities");
      expect(Object.keys(reader)).toEqual(["get"]);
      expect(Object.keys(writer)).toEqual(["set"]);
      expect(Object.isFrozen(reader)).toBe(true);
      expect(Object.isFrozen(writer)).toBe(true);
      const first = await reader.get(owner);
      expect(first).toEqual({ public: true, preview: false });
      expect(Object.isFrozen(first)).toBe(true);
      await writer.set({ public: false, preview: true });
      expect(first).toEqual({ public: true, preview: false });
      expect(await reader.get(owner)).toEqual({ public: false, preview: true });
      expect(
        await reader.get({ ...owner, declarationId: "private" }),
      ).toBeNull();
      expect(
        await reader.get({ ...owner, packageName: "@fixture/other" }),
      ).toBeNull();
      const invalid = {
        public: true,
        preview: true,
        packageName: "@fixture/other",
      };
      expect(
        await writer.set(invalid).catch((error: unknown) => error),
      ).toMatchObject({ code: "invalid_input" });
      await cleanupConsumer();
      cleanupConsumer = undefined;
      await web.reset();
      // The interface is now absent; a worker's read capability still sees durable hints.
      expect(
        await createServicePluginContext(
          worker.getMockShell(),
          "site",
        ).interfaceAvailability.get(owner),
      ).toEqual({ public: false, preview: true });
    } finally {
      await cleanupConsumer?.();
      await web.reset();
      await worker.reset();
    }
  });
  it("rejects malformed stored hints without reading private bookkeeping", async () => {
    const source = createMemoryRuntimeStateNamespace();
    const reader = createInterfaceAvailabilityReader(source);
    await createInterfaceAvailabilityWriter(source, owner).set({
      public: true,
      preview: true,
    });
    expect(await reader.get(owner)).toEqual({ public: true, preview: true });
    // Fault injection only: production readers never receive a namespace/store.
    const namespace = `public-interface-availability:v1:${sha256Hex(JSON.stringify([owner.packageName, owner.declarationId]))}`;
    await source
      .scoped({ namespace, schema: z.unknown() })
      .set("availability", { public: true, preview: true, secret: "PRIVATE" });
    expect(await reader.get(owner)).toBeNull();
    expect(await reader.get({ ...owner, declarationId: "\ud800" })).toBeNull();
  });
  it("separates owner tuples, rejects extra fields and sanitizes write failures", async () => {
    const source = createMemoryRuntimeStateNamespace();
    const reader = createInterfaceAvailabilityReader(source);
    const left = { packageName: "@fixture/a", declarationId: "b.c" };
    const right = { packageName: "@fixture/a.b", declarationId: "c" };
    const writer = createInterfaceAvailabilityWriter(source, left);
    await writer.set({ public: true, preview: false });
    expect(await reader.get(right)).toBeNull();
    expect(
      await reader.get({ packageName: "", declarationId: "x" }),
    ).toBeNull();
    const invalid = { public: true, preview: false, secret: "PRIVATE" };
    expect(
      await writer.set(invalid).catch((error: unknown) => error),
    ).toMatchObject({ code: "invalid_input" });
    const cause = new Error("PRIVATE storage data");
    const fault = spyOn(source, "scoped").mockImplementation(() => {
      throw cause;
    });
    try {
      expect(await reader.get(left)).toBeNull();
      const error: unknown = await writer
        .set({ public: false, preview: false })
        .catch((error: unknown) => error);
      expect(error).toMatchObject({ code: "handler_failed" });
      expect(String(error)).not.toContain("PRIVATE");
      if (!(error instanceof Error)) throw new Error("Missing SDK error");
      expect(operatorValidationCause(error)).toBe(cause);
    } finally {
      fault.mockRestore();
    }
  });
});
