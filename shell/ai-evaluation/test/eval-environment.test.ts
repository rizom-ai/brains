import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { rmSync } from "fs";
import { prepareEvalEnvironment } from "../src/eval-environment";

describe("prepareEvalEnvironment", () => {
  const bases: string[] = [];
  const processFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = processFetch;
    for (const base of bases.splice(0)) {
      rmSync(`${base}-git-remote`, { recursive: true, force: true });
      rmSync(`${base}-data`, { recursive: true, force: true });
    }
    delete process.env["EVAL_GIT_REMOTE"];
  });

  it("gives runs started in the same millisecond separate data paths", () => {
    const now = spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    try {
      bases.push(prepareEvalEnvironment(), prepareEvalEnvironment());
    } finally {
      now.mockRestore();
    }

    expect(bases[0]).not.toBe(bases[1]);
  });

  it("serves the eval network before a brain boots, in every run that prepares one", async () => {
    bases.push(prepareEvalEnvironment());

    // A provider an eval brain calls is answered, not reached.
    expect(
      (await fetch("https://api.unsplash.com/search/photos?query=wind")).status,
    ).toBe(401);
    // A host nothing answers is refused, naming it.
    expect(fetch("https://example.org/")).rejects.toThrow(
      "An eval reached the network: example.org is not answered here",
    );
  });

  it("lets the remote brain under evaluation through", async () => {
    // The remote brain, served on a loopback address the eval network does
    // not pass on its own, so only naming it as the remote lets it through,
    // with no lookup on the real network.
    const remote = Bun.serve({
      hostname: "127.0.0.2",
      port: 0,
      fetch: () => new Response("remote brain"),
    });
    try {
      const remoteUrl = `http://127.0.0.2:${remote.port}/mcp`;
      bases.push(prepareEvalEnvironment({ remoteUrl }));

      const response = await fetch(remoteUrl);
      expect(await response.text()).toBe("remote brain");
    } finally {
      await remote.stop(true);
    }
  });

  it("refuses that address when it is not the remote brain", async () => {
    const remote = Bun.serve({
      hostname: "127.0.0.2",
      port: 0,
      fetch: () => new Response("remote brain"),
    });
    try {
      bases.push(prepareEvalEnvironment());
      const refused = await fetch(`http://127.0.0.2:${remote.port}/mcp`).then(
        () => undefined,
        (failure: unknown) => failure,
      );
      expect(String(refused)).toContain("An eval reached the network");
    } finally {
      await remote.stop(true);
    }
  });
});
