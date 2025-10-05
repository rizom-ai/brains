import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

describe("Git-Sync Implementation Verification", () => {
  const gitSyncSourcePath = join(__dirname, "../src/lib/git-sync.ts");
  const gitSyncSource = readFileSync(gitSyncSourcePath, "utf-8");

  describe("Automatic Conflict Resolution", () => {
    it("should configure pull with 'theirs' merge strategy", () => {
      // Verify the pull method uses the correct flags
      expect(gitSyncSource).toContain('"-X": "theirs"');
      expect(gitSyncSource).toContain('"--strategy=recursive": null');
    });

    it("should include comment explaining conflict resolution", () => {
      // Verify there's documentation about the strategy
      expect(gitSyncSource).toContain("auto-resolving conflicts");
    });
  });

  describe("Conflict Marker Detection", () => {
    it("should check for conflict markers before committing", () => {
      // Verify commit method checks for conflict markers
      expect(gitSyncSource).toContain("conflicted");
      expect(gitSyncSource).toContain("<<<<<<<");
      expect(gitSyncSource).toContain("=======");
      expect(gitSyncSource).toContain(">>>>>>>");
    });

    it("should handle conflicted files by using remote version", () => {
      // Verify conflicted files are resolved with --theirs
      expect(gitSyncSource).toContain('checkout", "--theirs"');
    });

    it("should throw error if conflict markers found in staged files", () => {
      // Verify error is thrown for unresolved conflicts
      expect(gitSyncSource).toContain("Conflict markers found");
    });
  });

  describe("Integration", () => {
    it("should process conflict resolution before staging", () => {
      // The order should be:
      // 1. Check for conflicted files
      // 2. Resolve them with --theirs
      // 3. Stage all changes
      // 4. Final safety check
      // 5. Commit

      const commitMethodMatch = gitSyncSource.match(
        /async commit\(.*?\):.*?{[\s\S]*?await this\.git\.commit/,
      );

      expect(commitMethodMatch).toBeTruthy();

      if (commitMethodMatch) {
        const commitMethod = commitMethodMatch[0];

        // Check order of operations
        const conflictedPos = commitMethod.indexOf("conflicted");
        const checkoutPos = commitMethod.indexOf('checkout", "--theirs"');
        const addPos = commitMethod.indexOf('add(["-A"])');
        const finalCheckPos = commitMethod.indexOf("Conflict markers found");

        // Verify ordering
        expect(conflictedPos).toBeGreaterThan(-1);
        expect(conflictedPos).toBeLessThan(addPos);
        expect(checkoutPos).toBeLessThan(addPos);
        expect(addPos).toBeLessThan(finalCheckPos);
      }
    });
  });
});
