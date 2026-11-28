import { afterEach, describe, expect, it } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromeProfile, sweepChromeProfiles } from "./browser";

const CHROMIUM_PATH = process.env["CONSOLE_CHROMIUM_PATH"];

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "chrome-profile-test-"));
  roots.push(root);
  return root;
}

describe("chromeProfile", () => {
  it("gives the process one profile directory, named for its process", () => {
    const first = chromeProfile();
    expect(chromeProfile()).toBe(first);
    expect(first.directory.startsWith(tmpdir())).toBe(true);
    expect(first.directory).toContain(`brains-chrome-${process.pid}-`);
    expect(existsSync(first.directory)).toBe(true);
  });
});

describe("sweepChromeProfiles", () => {
  it("removes profiles of processes that have exited and keeps the rest", () => {
    const root = tempRoot();
    for (const name of [
      "brains-chrome-111-a",
      "brains-chrome-222-b",
      "something-else",
    ])
      mkdirSync(join(root, name));

    sweepChromeProfiles(root, (pid) => pid === 222);

    expect(readdirSync(root).sort()).toEqual([
      "brains-chrome-222-b",
      "something-else",
    ]);
  });

  it("keeps the running process's own profile", () => {
    const { directory } = chromeProfile();
    sweepChromeProfiles();
    expect(existsSync(directory)).toBe(true);
  });
});

describe.skipIf(!CHROMIUM_PATH)("a browser run", () => {
  it("leaves no Chrome profile behind once its process has exited", async () => {
    const bunProfiles = (): string[] =>
      readdirSync(tmpdir()).filter((name) => name.endsWith(".bun-chrome"));
    const before = new Set(bunProfiles());
    const child = Bun.spawn(
      [
        process.execPath,
        "-e",
        `const { chromeBackend, chromeProfile } = await import(${JSON.stringify(join(import.meta.dir, "browser.ts"))});
const dataStore = chromeProfile();
const view = new Bun.WebView({ width: 400, height: 300, backend: chromeBackend(${JSON.stringify(CHROMIUM_PATH)}), dataStore });
await view.navigate("data:text/html,<p>run</p>");
console.log(dataStore.directory);
view.close();
Bun.WebView.closeAll();`,
      ],
      { stdout: "pipe", stderr: "inherit" },
    );
    const directory = (await new Response(child.stdout).text()).trim();
    expect(await child.exited).toBe(0);
    expect(directory).toContain("brains-chrome-");

    sweepChromeProfiles();

    expect(existsSync(directory)).toBe(false);
    expect(bunProfiles().filter((name) => !before.has(name))).toEqual([]);
  });
});
