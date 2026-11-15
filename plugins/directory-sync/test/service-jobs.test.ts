import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMockShell } from "@brains/plugins/test";
import { directorySyncContextOf } from "../src/lib/sync-context";
import { DirectorySyncService } from "../src/service";
import { directorySyncConfigSchema } from "../src/types";
import { directorySyncRuntime } from "./sync-runtime";

const paths: string[] = [];
afterEach(() => {
  for (const path of paths.splice(0))
    rmSync(path, { recursive: true, force: true });
});

/**
 * The jobs directory sync hands the queue, as its class registered them:
 * the seven every role runs, then, with Git configured, the Git sync
 * request the sync tool and Studio queue. They are declared before Git
 * connects, as the runtime registers a package's jobs before it finishes
 * registering.
 */
describe("directory sync's jobs", () => {
  it("adds the Git sync request when Git is configured, before Git connects", async () => {
    const checkout = mkdtempSync(join(tmpdir(), "directory-sync-jobs-"));
    paths.push(checkout);
    const types = async (git: boolean): Promise<string[]> => {
      const shell = createMockShell({
        dataDir: checkout,
        ...(git ? { gitBrokerCheckout: checkout } : {}),
      });
      const sync = new DirectorySyncService(
        directorySyncConfigSchema.parse({
          autoSync: false,
          initialSync: false,
          ...(git ? { git: { repo: "org/content" } } : {}),
        }),
        directorySyncContextOf(await directorySyncRuntime(shell)),
      );
      await sync.registerCommon();
      return sync.jobHandlers().map(({ type }) => type);
    };
    const roles = [
      "directory-sync",
      "directory-export",
      "directory-import",
      "directory-delete",
      "directory-cleanup",
      "cover-image-convert",
      "inline-image-convert",
    ];
    expect(await types(false)).toEqual(roles);
    expect(await types(true)).toEqual([...roles, "sync-request"]);
  });
});
