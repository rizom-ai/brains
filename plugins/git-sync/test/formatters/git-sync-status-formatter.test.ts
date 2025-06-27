import { describe, expect, it } from "bun:test";
import { GitSyncStatusFormatter } from "../../src/formatters/git-sync-status-formatter";

describe("GitSyncStatusFormatter", () => {
  const formatter = new GitSyncStatusFormatter();

  describe("format", () => {
    it("should format clean repository status", () => {
      const status = {
        isRepo: true,
        hasChanges: false,
        ahead: 0,
        behind: 0,
        branch: "main",
        lastCommit: "abc123def456",
        files: [],
      };

      const result = formatter.format(status);

      expect(result).toContain("## 🔄 Git Repository Status");
      expect(result).toContain("**Branch:** `main`");
      expect(result).toContain("✅ Clean");
      expect(result).toContain("✅ **Fully synchronized**");
      expect(result).toContain("**Last commit:** `abc123d`");
    });

    it("should format repository with changes", () => {
      const status = {
        isRepo: true,
        hasChanges: true,
        ahead: 2,
        behind: 1,
        branch: "feature/test",
        files: [
          { path: "src/index.ts", status: "M" },
          { path: "README.md", status: "A" },
        ],
      };

      const result = formatter.format(status);

      expect(result).toContain("⚠️ Uncommitted changes");
      expect(result).toContain("**Ahead:** 2 commits ↑");
      expect(result).toContain("**Behind:** 1 commit ↓");
      expect(result).toContain("### Changed Files");
      expect(result).toContain("`src/index.ts` (modified)");
      expect(result).toContain("`README.md` (added)");
    });

    it("should handle non-repository", () => {
      const status = {
        isRepo: false,
        hasChanges: false,
        ahead: 0,
        behind: 0,
        branch: "",
        files: [],
      };

      const result = formatter.format(status);

      expect(result).toContain("❌ **Not a git repository**");
      expect(result).not.toContain("Changed Files");
    });

    it("should truncate long file lists", () => {
      const files = Array.from({ length: 15 }, (_, i) => ({
        path: `file${i}.ts`,
        status: "M",
      }));

      const status = {
        isRepo: true,
        hasChanges: true,
        ahead: 0,
        behind: 0,
        branch: "main",
        files,
      };

      const result = formatter.format(status);

      expect(result).toContain("`file0.ts`");
      expect(result).toContain("`file9.ts`");
      expect(result).not.toContain("`file10.ts`");
      expect(result).toContain("... and 5 more");
    });
  });

  describe("canFormat", () => {
    it("should return true for valid git status objects", () => {
      const status = {
        isRepo: true,
        hasChanges: false,
        branch: "main",
      };

      expect(formatter.canFormat(status)).toBe(true);
    });

    it("should return false for invalid objects", () => {
      expect(formatter.canFormat(null)).toBe(false);
      expect(formatter.canFormat("string")).toBe(false);
      expect(formatter.canFormat({})).toBe(false);
      expect(formatter.canFormat({ branch: "main" })).toBe(false); // Missing required fields
    });
  });
});
