import { createTempDir } from "@brains/test-utils";
import { describe, expect, it } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { upgradePilotRepo, type UpgradeExec } from "../src/upgrade";

async function makeRepo(pinnedVersion: string): Promise<string> {
  const root = await createTempDir("brains-ops-upgrade-");
  const repo = join(root, "rover-pilot");
  await mkdir(repo, { recursive: true });
  await writeFile(
    join(repo, "package.json"),
    JSON.stringify(
      {
        name: "rover-pilot",
        private: true,
        devDependencies: { "@rizom/ops": pinnedVersion },
      },
      null,
      2,
    ) + "\n",
  );
  return repo;
}

function fakeExec(
  repo: string,
  bumpTo: string,
): { exec: UpgradeExec; calls: string[][] } {
  const calls: string[][] = [];
  const exec: UpgradeExec = async (command, cwd) => {
    expect(cwd).toBe(repo);
    calls.push(command);
    if (command[0] === "bun" && command[1] === "add") {
      await writeFile(
        join(repo, "package.json"),
        JSON.stringify(
          {
            name: "rover-pilot",
            private: true,
            devDependencies: { "@rizom/ops": bumpTo },
          },
          null,
          2,
        ) + "\n",
      );
    }
  };
  return { exec, calls };
}

describe("upgradePilotRepo", () => {
  it("bumps the pin then reruns init from the upgraded package", async () => {
    const repo = await makeRepo("0.2.0-alpha.1");
    const { exec, calls } = fakeExec(repo, "0.2.0-alpha.2");

    const result = await upgradePilotRepo(repo, { exec });

    expect(calls).toEqual([
      ["bun", "add", "--dev", "--exact", "@rizom/ops@latest"],
      ["bun", "x", "brains-ops", "init", "."],
    ]);
    expect(result).toEqual({ from: "0.2.0-alpha.1", to: "0.2.0-alpha.2" });
  });

  it("targets an explicit version when one is given", async () => {
    const repo = await makeRepo("0.2.0-alpha.1");
    const { exec, calls } = fakeExec(repo, "0.2.0-alpha.5");

    const result = await upgradePilotRepo(repo, {
      exec,
      version: "0.2.0-alpha.5",
    });

    expect(calls[0]).toEqual([
      "bun",
      "add",
      "--dev",
      "--exact",
      "@rizom/ops@0.2.0-alpha.5",
    ]);
    expect(result).toEqual({ from: "0.2.0-alpha.1", to: "0.2.0-alpha.5" });
  });

  it("still reruns init when the pin is already current", async () => {
    const repo = await makeRepo("0.2.0-alpha.2");
    const { exec, calls } = fakeExec(repo, "0.2.0-alpha.2");

    const result = await upgradePilotRepo(repo, { exec });

    expect(calls).toHaveLength(2);
    expect(result).toEqual({ from: "0.2.0-alpha.2", to: "0.2.0-alpha.2" });
    expect(await readFile(join(repo, "package.json"), "utf8")).toContain(
      "0.2.0-alpha.2",
    );
  });

  it("rejects a repo without an @rizom/ops pin", async () => {
    const root = await createTempDir("brains-ops-upgrade-");
    const repo = join(root, "rover-pilot");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "package.json"), '{"name":"not-a-pilot"}\n');

    expect(upgradePilotRepo(repo, { exec: async () => {} })).rejects.toThrow(
      /@rizom\/ops/,
    );
  });
});
