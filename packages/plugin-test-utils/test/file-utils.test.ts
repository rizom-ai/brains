import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { FileTestUtils } from "../src/file-utils";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("FileTestUtils", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "file-utils-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should create file with content", () => {
    const filePath = join(tempDir, "test.txt");
    FileTestUtils.createFile(filePath, "Hello, World!");

    expect(FileTestUtils.exists(filePath)).toBe(true);
    expect(FileTestUtils.readFile(filePath)).toBe("Hello, World!");
  });

  it("should create nested directories when creating file", () => {
    const filePath = join(tempDir, "nested", "deep", "test.txt");
    FileTestUtils.createFile(filePath, "Nested content");

    expect(FileTestUtils.exists(filePath)).toBe(true);
    expect(FileTestUtils.readFile(filePath)).toBe("Nested content");
  });

  it("should create multiple files", () => {
    const files = {
      "file1.txt": "Content 1",
      "dir/file2.txt": "Content 2",
      "dir/subdir/file3.txt": "Content 3",
    };

    FileTestUtils.createFiles(tempDir, files);

    expect(FileTestUtils.readFile(join(tempDir, "file1.txt"))).toBe(
      "Content 1",
    );
    expect(FileTestUtils.readFile(join(tempDir, "dir/file2.txt"))).toBe(
      "Content 2",
    );
    expect(FileTestUtils.readFile(join(tempDir, "dir/subdir/file3.txt"))).toBe(
      "Content 3",
    );
  });

  it("should list files in directory", () => {
    FileTestUtils.createFiles(tempDir, {
      "file1.txt": "1",
      "file2.txt": "2",
      "dir/file3.txt": "3",
    });

    const files = FileTestUtils.listFiles(tempDir);
    expect(files).toContain("file1.txt");
    expect(files).toContain("file2.txt");
    // listFiles only returns files, not directories
    expect(files).not.toContain("dir");
    expect(files).not.toContain("file3.txt");
  });

  it("should list files recursively", () => {
    FileTestUtils.createFiles(tempDir, {
      "file1.txt": "1",
      "dir/file2.txt": "2",
      "dir/subdir/file3.txt": "3",
    });

    const files = FileTestUtils.listFiles(tempDir, true);
    expect(files).toContain("file1.txt");
    expect(files).toContain(join("dir", "file2.txt"));
    expect(files).toContain(join("dir", "subdir", "file3.txt"));
  });

  it("should create directory structure", () => {
    const dirs = ["dir1", "dir2/subdir", "dir3/sub1/sub2"];
    FileTestUtils.createDirs(tempDir, dirs);

    expect(FileTestUtils.exists(join(tempDir, "dir1"))).toBe(true);
    expect(FileTestUtils.exists(join(tempDir, "dir2/subdir"))).toBe(true);
    expect(FileTestUtils.exists(join(tempDir, "dir3/sub1/sub2"))).toBe(true);
  });

  it("should assert file content with string", () => {
    const filePath = join(tempDir, "test.txt");
    FileTestUtils.createFile(filePath, "Expected content");

    // Should not throw
    FileTestUtils.assertFileContent(filePath, "Expected content");

    // Should throw
    expect(() => {
      FileTestUtils.assertFileContent(filePath, "Wrong content");
    }).toThrow("File content mismatch");
  });

  it("should assert file content with regex", () => {
    const filePath = join(tempDir, "test.txt");
    FileTestUtils.createFile(filePath, "Hello, World! 123");

    // Should not throw
    FileTestUtils.assertFileContent(filePath, /Hello.*\d+/);

    // Should throw
    expect(() => {
      FileTestUtils.assertFileContent(filePath, /Goodbye/);
    }).toThrow("File content does not match pattern");
  });

  it("should assert file exists", () => {
    const filePath = join(tempDir, "exists.txt");
    FileTestUtils.createFile(filePath, "content");

    // Should not throw
    FileTestUtils.assertExists(filePath);

    // Should throw
    expect(() => {
      FileTestUtils.assertExists(join(tempDir, "not-exists.txt"));
    }).toThrow("Expected file to exist");
  });

  it("should assert file does not exist", () => {
    const filePath = join(tempDir, "not-exists.txt");

    // Should not throw
    FileTestUtils.assertNotExists(filePath);

    // Should throw
    FileTestUtils.createFile(filePath, "content");
    expect(() => {
      FileTestUtils.assertNotExists(filePath);
    }).toThrow("Expected file not to exist");
  });

  it("should wait for file to exist", async () => {
    const filePath = join(tempDir, "delayed.txt");

    // Create file after delay
    setTimeout(() => {
      FileTestUtils.createFile(filePath, "delayed content");
    }, 100);

    // Should wait and succeed
    await FileTestUtils.waitForFile(filePath, 1000);
    expect(FileTestUtils.exists(filePath)).toBe(true);
  });

  it("should timeout waiting for file", async () => {
    const filePath = join(tempDir, "never-exists.txt");

    // Should timeout
    expect(FileTestUtils.waitForFile(filePath, 100)).rejects.toThrow(
      "Timeout waiting for file",
    );
  });

  it("should handle empty directory listing", () => {
    const emptyDir = join(tempDir, "empty");
    FileTestUtils.createDirs(tempDir, ["empty"]);

    const files = FileTestUtils.listFiles(emptyDir);
    expect(files).toEqual([]);
  });

  it("should handle non-existent directory listing", () => {
    const files = FileTestUtils.listFiles(join(tempDir, "does-not-exist"));
    expect(files).toEqual([]);
  });
});
