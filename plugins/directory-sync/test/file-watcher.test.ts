import { describe, it, expect } from "bun:test";
import { shouldProcessPath } from "../src/lib/file-watcher";

describe("shouldProcessPath", () => {
  const syncPath = "/data/brain";

  it("should process .md files in entity type directories", () => {
    expect(shouldProcessPath(`${syncPath}/post/hello.md`, syncPath)).toBe(true);
    expect(shouldProcessPath(`${syncPath}/link/ref.md`, syncPath)).toBe(true);
  });

  it("should process image files in image/ directory", () => {
    expect(shouldProcessPath(`${syncPath}/image/photo.png`, syncPath)).toBe(
      true,
    );
    expect(shouldProcessPath(`${syncPath}/image/banner.jpg`, syncPath)).toBe(
      true,
    );
  });

  it("should reject files in underscore-prefixed directories", () => {
    expect(
      shouldProcessPath(`${syncPath}/_obsidian/templates/post.md`, syncPath),
    ).toBe(false);
    expect(
      shouldProcessPath(`${syncPath}/_obsidian/fileClasses/post.md`, syncPath),
    ).toBe(false);
    expect(
      shouldProcessPath(`${syncPath}/_config/something.md`, syncPath),
    ).toBe(false);
  });

  it("should reject non-md, non-image files", () => {
    expect(shouldProcessPath(`${syncPath}/post/data.json`, syncPath)).toBe(
      false,
    );
    expect(shouldProcessPath(`${syncPath}/post/notes.txt`, syncPath)).toBe(
      false,
    );
  });

  it("should reject image files outside image/ directory", () => {
    expect(shouldProcessPath(`${syncPath}/post/photo.png`, syncPath)).toBe(
      false,
    );
  });

  it("should process root-level .md files", () => {
    expect(shouldProcessPath(`${syncPath}/notes.md`, syncPath)).toBe(true);
  });
});
