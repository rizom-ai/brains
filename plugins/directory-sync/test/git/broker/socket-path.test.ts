import { describe, expect, it } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gitBrokerSocketPath } from "../../../src/lib/broker/server";

const UNIX_SOCKET_PATH_LIMIT = 107;

describe("gitBrokerSocketPath", () => {
  it("keeps the socket inside the instance runtime dir when the address fits", () => {
    expect(gitBrokerSocketPath(join("/brain", ".brain-runtime"))).toBe(
      join("/brain", ".brain-runtime", "git-broker.sock"),
    );
  });

  it("moves the socket to the OS temp dir, still one per instance, when the instance path is too long for a unix socket", () => {
    // A worktree under a long home path, say. The kernel truncates rather than
    // refusing, which would leave owner and clients on different addresses.
    const deep = join("/", "d".repeat(120), ".brain-runtime");
    const other = join("/", "e".repeat(120), ".brain-runtime");

    const socket = gitBrokerSocketPath(deep);

    expect(Buffer.byteLength(socket)).toBeLessThanOrEqual(
      UNIX_SOCKET_PATH_LIMIT,
    );
    expect(socket.startsWith(tmpdir())).toBe(true);
    expect(socket.startsWith(deep)).toBe(false);
    // The supervisor and the broker derive it independently; both must land
    // on the same address for the same instance and never share one across
    // instances.
    expect(gitBrokerSocketPath(deep)).toBe(socket);
    expect(gitBrokerSocketPath(other)).not.toBe(socket);
  });
});
