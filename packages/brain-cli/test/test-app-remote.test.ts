import { afterEach, describe, expect, it } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runProcess } from "@brains/utils/run-process";
import {
  prepareTestAppRemote,
  remoteAgentProblems,
  withholdAgent,
} from "../scripts/test-app-remote";

const approvedPeer = `---
name: Rizom Brain Docs
kind: person
brainName: Doc
url: 'https://docs.rizom.ai/a2a'
repoDid: 'did:plc:abc'
brainDid: 'did:web:docs.rizom.ai'
cardUri: 'at://did:plc:abc/ai.rizom.brain.card/self'
cardCid: 'bafy'
cardLastError: 'timeout'
cardFailureCount: 2
cardUnavailableAt: '2026-11-01T00:00:00.000Z'
cardStaleAfter: '2026-12-01T00:00:00.000Z'
status: approved
discoveredAt: '2026-08-04T17:17:15.474Z'
---
# Agent

## About
Maintains the Brains documentation.

## Skills

- Set Up Brains: Guide installation. [best-practices]
`;

const frontmatter = (markdown: string): string =>
  /^---\n([\s\S]*?)\n---\n/.exec(markdown)?.[1] ?? "";

describe("withholdAgent", () => {
  it("turns an approved peer into a discovered contact", () => {
    const withheld = frontmatter(withholdAgent(approvedPeer));
    expect(withheld).toContain("status: discovered");
    expect(withheld).not.toContain("approved");
  });

  it("drops the ATProto card a refresh would fetch", () => {
    const withheld = frontmatter(withholdAgent(approvedPeer));
    for (const field of [
      "repoDid",
      "brainDid",
      "cardUri",
      "cardCid",
      "cardLastError",
      "cardFailureCount",
      "cardUnavailableAt",
      "cardStaleAfter",
    ]) {
      expect(withheld).not.toContain(`${field}:`);
    }
  });

  it("keeps who the agent is and what it does", () => {
    const withheld = withholdAgent(approvedPeer);
    expect(frontmatter(withheld)).toContain("name: Rizom Brain Docs");
    expect(frontmatter(withheld)).toContain("url: https://docs.rizom.ai/a2a");
    expect(frontmatter(withheld)).toContain(
      "discoveredAt: 2026-08-04T17:17:15.474Z",
    );
    expect(withheld.slice(withheld.indexOf("# Agent"))).toBe(
      approvedPeer.slice(approvedPeer.indexOf("# Agent")),
    );
  });

  it("leaves archived agents archived and sightings' provenance in place", () => {
    const sighting = approvedPeer
      .replace("status: approved", "status: archived")
      .replace("---\n#", "introducedBy:\n  - yeehaa.io\nhops: 2\n---\n#");
    const withheld = frontmatter(withholdAgent(sighting));
    expect(withheld).toContain("status: archived");
    expect(withheld).toContain("introducedBy:");
    expect(withheld).toContain("hops: 2");
  });
});

describe("prepareTestAppRemote", () => {
  const dirs: string[] = [];
  const tempDir = (prefix: string): string => {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    dirs.push(dir);
    return dir;
  };
  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function outsideSeed(): string {
    const seed = tempDir("test-app-seed-");
    mkdirSync(join(seed, "agent"));
    mkdirSync(join(seed, "note"));
    writeFileSync(join(seed, "agent", "docs.rizom.ai.md"), approvedPeer);
    writeFileSync(join(seed, "note", "hello.md"), "# Hello\n");
    return seed;
  }

  async function show(remote: string, path: string): Promise<string> {
    const shown = await runProcess([
      "git",
      "--git-dir",
      remote,
      "show",
      `main:${path}`,
    ]);
    if (shown.exitCode !== 0) throw new Error(shown.stderr);
    return shown.stdout;
  }

  it("builds the remote from a withheld copy and leaves the seed as it was", async () => {
    const seed = outsideSeed();
    const remote = join(tempDir("test-app-remote-"), "content.git");

    const result = await prepareTestAppRemote({
      seedPath: seed,
      gitUrl: `file://${remote}`,
      branch: "main",
    });

    expect(result).toBe("prepared");
    expect(readFileSync(join(seed, "agent", "docs.rizom.ai.md"), "utf8")).toBe(
      approvedPeer,
    );
    expect(await show(remote, "agent/docs.rizom.ai.md")).toBe(
      withholdAgent(approvedPeer),
    );
    expect(await show(remote, "note/hello.md")).toBe("# Hello\n");
    expect(await remoteAgentProblems(`file://${remote}`, "main")).toEqual([]);
  });

  it("boots from a remote it already prepared", async () => {
    const seed = outsideSeed();
    const remote = join(tempDir("test-app-remote-"), "content.git");
    const options = {
      seedPath: seed,
      gitUrl: `file://${remote}`,
      branch: "main",
    };

    await prepareTestAppRemote(options);

    expect(await prepareTestAppRemote(options)).toBe("present");
  });

  it("refuses a remote that holds an approved peer", async () => {
    const seed = outsideSeed();
    const remote = join(tempDir("test-app-remote-"), "content.git");
    const work = tempDir("test-app-work-");
    for (const args of [
      ["init", "--bare", "--initial-branch=main", remote],
      ["init", "--initial-branch=main", work],
    ]) {
      await runProcess(["git", ...args]);
    }
    mkdirSync(join(work, "agent"));
    writeFileSync(join(work, "agent", "docs.rizom.ai.md"), approvedPeer);
    for (const args of [
      ["add", "."],
      ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-m", "seed"],
      ["push", remote, "main"],
    ]) {
      await runProcess(["git", ...args], { cwd: work });
    }

    expect(await remoteAgentProblems(`file://${remote}`, "main")).toEqual([
      "agent/docs.rizom.ai.md: status approved",
      "agent/docs.rizom.ai.md: ATProto card reference",
    ]);
    const refusal = await prepareTestAppRemote({
      seedPath: seed,
      gitUrl: `file://${remote}`,
      branch: "main",
    }).then(
      () => "prepared",
      (error: unknown) => String(error),
    );
    expect(refusal).toContain("docs.rizom.ai.md: status approved");
  });
});
