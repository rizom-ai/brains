import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSilentLogger } from "@brains/test-utils";
import { createBrokerGitSync } from "../broker-git-sync";
import {
  MAX_FRAME_BYTES,
  MAX_PAYLOAD_BYTES,
} from "../../../src/lib/broker/protocol";
import { SocketWriter } from "../../../src/lib/broker/socket-writer";
import type { WritableSocket } from "../../../src/lib/broker/socket-writer";

/**
 * Review blocker 4.
 *
 * The limits were declared and never enforced. An operation result, a
 * command's output, and the bytes a slow peer has not drained could each grow
 * without a ceiling — inside the one process that must stay alive to own the
 * checkout. Running the broker out of memory is a way to lose the owner that
 * no supervision can recover better than not losing it.
 */

const LINUX = process.platform === "linux";

let scratch: string | undefined;

afterEach(async () => {
  if (scratch) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});

describe("a peer that will not drain", () => {
  it("is refused rather than buffered without end", () => {
    let accepting = false;
    const socket: WritableSocket = {
      write: (bytes: Uint8Array): number => (accepting ? bytes.length : 0),
    };
    const writer = new SocketWriter(socket);

    // Every frame is retained because nothing is being taken. Reach the
    // exact two-frame boundary directly: using hundreds of small frames makes
    // SocketWriter repeatedly copy a growing buffer and turns this unit test
    // into an O(n²) allocation workload under parallel CI load.
    const frame = new Uint8Array(MAX_FRAME_BYTES);
    writer.send(frame);
    writer.send(frame);

    expect(() => writer.send(frame)).toThrow(/backpressure|pending|limit/i);

    accepting = true;
    writer.flush();
    expect(writer.pendingBytes).toBe(0);
  });
});

describe.skipIf(!LINUX)("an oversized result", () => {
  it("is refused truthfully instead of remembered", async () => {
    scratch = await mkdtemp(join(tmpdir(), "broker-bounds-"));
    const checkout = join(scratch, "checkout");
    const gitSync = await createBrokerGitSync({
      logger: createSilentLogger(),
      dataDir: checkout,
      branch: "main",
      authorName: "Test",
      authorEmail: "test@example.com",
    });
    await gitSync.initialize();

    // A file larger than a frame can carry. `show-file` would return it as a
    // string, which is then journalled, remembered, and only *then* found to
    // be unsendable — leaving a remembered value no retry can ever deliver.
    const huge = "x".repeat(MAX_PAYLOAD_BYTES + 1024);
    await writeFile(join(checkout, "huge.md"), huge);
    await gitSync.commit("huge");
    const log = await gitSync.log("huge.md");
    const sha = log[0]?.sha ?? "";

    const outcome = await gitSync.show(sha, "huge.md").then(
      () => undefined,
      (error: unknown) => String(error),
    );
    expect(outcome).toMatch(/too large|limit|bytes/i);

    // And the owner is still working: an oversized answer is one failed
    // request, not a broker that has to be replaced.
    expect((await gitSync.getStatus()).isRepo).toBe(true);

    await gitSync.cleanup();
  }, 120_000);
});
