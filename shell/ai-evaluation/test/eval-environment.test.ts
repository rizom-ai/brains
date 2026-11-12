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
    // An address the guard does not count as loopback, which the real network
    // refuses at once: no name to resolve, so the test waits on no resolver.
    bases.push(prepareEvalEnvironment({ remoteUrl: "http://0.0.0.0:1/mcp" }));

    // Passed to the real network, which refuses the connection: not refused here.
    const error = await fetch("http://0.0.0.0:1/mcp").then(
      () => undefined,
      (failure: unknown) => failure,
    );
    expect(String(error)).not.toContain("An eval reached the network");
  });
});
