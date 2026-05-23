import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { YAMLLoader } from "@brains/ai-evaluation";

async function findYamlFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return findYamlFiles(path);
      if (entry.isFile() && /\.ya?ml$/u.test(entry.name)) return [path];
      return [];
    }),
  );

  return files.flat();
}

describe("Relay eval cases", () => {
  it("loads every Relay eval YAML case", async () => {
    const testCasesDir = join(import.meta.dir, "..", "test-cases");
    const loader = YAMLLoader.createFresh({ directory: testCasesDir });
    const files = await findYamlFiles(testCasesDir);
    const cases = await Promise.all(
      files.map((file) => loader.loadTestCase(file)),
    );

    expect(cases.length).toBeGreaterThanOrEqual(33);
    expect(cases.map((testCase) => testCase.id)).toContain(
      "relay-scenario-team-meeting-to-memory-loop",
    );
    expect(cases.map((testCase) => testCase.id)).toContain(
      "relay-scenario-new-teammate-onboarding",
    );
    expect(cases.map((testCase) => testCase.id)).toContain(
      "relay-tool-a2a-approved-peer-call",
    );
    expect(cases.map((testCase) => testCase.id)).toContain(
      "relay-tool-operator-dashboard-cms-status",
    );
    expect(cases.map((testCase) => testCase.id)).toContain(
      "relay-tool-directory-sync-status",
    );
    expect(cases.map((testCase) => testCase.id)).toContain(
      "relay-tool-site-builder-preview-build",
    );
    expect(cases.map((testCase) => testCase.id)).toContain(
      "relay-tool-create-image",
    );
    expect(cases.map((testCase) => testCase.id)).toContain(
      "relay-tool-prompt-topic-guidance-get",
    );
    expect(cases.map((testCase) => testCase.id)).toContain(
      "relay-permission-public-save-note-denied",
    );
    expect(cases.map((testCase) => testCase.id)).toContain(
      "relay-permission-public-peer-call-denied",
    );
    expect(cases.map((testCase) => testCase.id)).toContain(
      "relay-permission-shared-team-memory-search",
    );
  });
});
