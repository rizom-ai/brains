import { describe, expect, it } from "bun:test";
import { fileURLToPath } from "node:url";
import { createTestDirectory, waitUntil } from "@brains/test-utils";
import {
  openFoldStorage,
  seedFold,
  readFold,
  reconcileFold,
} from "./helpers/fold-storage";

describe("FAQ fold survives abrupt process loss", () => {
  it.each(["before", "after"] as const)(
    "restarts %s commit without losing or double-counting an asking",
    async (mode) => {
      const directory = await createTestDirectory("faq-fold-crash");
      let service = await openFoldStorage(directory.dir);
      await seedFold(service);
      service.close();
      const child = Bun.spawn(
        [
          process.execPath,
          fileURLToPath(
            new URL("./helpers/fold-crash-child.ts", import.meta.url),
          ),
          directory.dir,
          mode,
        ],
        { stdout: "pipe", stderr: "pipe" },
      );
      try {
        await waitUntil(
          async () => Bun.file(`${directory.dir}/paused`).exists(),
          "the fold crash checkpoint",
          { timeoutMs: 10000 },
        );
        child.kill("SIGKILL");
        await child.exited;
        expect(child.signalCode).toBe("SIGKILL");
        service = await openFoldStorage(directory.dir);
        expect((await readFold(service, "target"))?.metadata.asked).toBe(
          mode === "before" ? 3 : 5,
        );
        expect(
          (await readFold(service, "source"))?.metadata.asked ?? null,
        ).toBe(mode === "before" ? 2 : null);
        expect(await reconcileFold(service)).toEqual(
          mode === "before"
            ? { outcome: "folded", into: "target" }
            : { outcome: "gone" },
        );
        expect(await reconcileFold(service)).toEqual({ outcome: "gone" });
        expect(await readFold(service, "source")).toBeNull();
        expect((await readFold(service, "target"))?.metadata.asked).toBe(5);
      } finally {
        if (child.exitCode === null) child.kill("SIGKILL");
        await child.exited;
        service.close();
        await directory.cleanup();
      }
    },
    20000,
  );
});
