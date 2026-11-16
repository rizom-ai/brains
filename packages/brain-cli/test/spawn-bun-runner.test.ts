import { describe, expect, it, mock } from "bun:test";
import { EventEmitter } from "node:events";
import type { SpawnOptions } from "node:child_process";
import {
  spawnBunRunner,
  type SignalProcess,
  type SpawnedProcess,
} from "../src/lib/spawn-bun-runner";

function fakes(): {
  child: EventEmitter & SpawnedProcess;
  spawnImpl: ReturnType<typeof mock>;
  processImpl: EventEmitter & SignalProcess;
} {
  const child: EventEmitter & SpawnedProcess = Object.assign(
    new EventEmitter(),
    { exitCode: null, killed: false, kill: (): boolean => true },
  );
  const spawnImpl = mock(
    (_command: string, _args: string[], _options: SpawnOptions) => child,
  );
  const processImpl: EventEmitter & SignalProcess = Object.assign(
    new EventEmitter(),
    { env: { FROM_PARENT: "1" }, kill: (): boolean => true },
  );
  return { child, spawnImpl, processImpl };
}

describe("spawnBunRunner", () => {
  it("gives the child the environment it is asked to", async () => {
    const { child, spawnImpl, processImpl } = fakes();
    const result = spawnBunRunner({
      cwd: "/tmp",
      args: ["script.js"],
      env: { FROM_CALLER: "1" },
      spawnImpl,
      processImpl,
    });
    child.emit("close", 0, null);

    expect(await result).toEqual({ success: true });
    expect(spawnImpl.mock.calls[0]?.[2]?.env).toEqual({ FROM_CALLER: "1" });
  });

  it("passes only the exit status on when no failure message is given", async () => {
    const { child, spawnImpl, processImpl } = fakes();
    const result = spawnBunRunner({
      cwd: "/tmp",
      args: ["script.js"],
      spawnImpl,
      processImpl,
    });
    child.emit("close", 3, null);

    expect(await result).toEqual({ success: false, exitCode: 3 });
    expect(spawnImpl.mock.calls[0]?.[2]?.env).toEqual({ FROM_PARENT: "1" });
  });
});
