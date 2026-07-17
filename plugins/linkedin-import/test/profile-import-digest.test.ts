import { describe, expect, it } from "bun:test";
import {
  profileImportDigest,
  profileImportPreviewDigest,
} from "../src/lib/profile-import-digest";

describe("profileImportDigest", () => {
  it("is stable across object key order", () => {
    const first = profileImportDigest({
      name: "Ada Morgan",
      positions: [
        {
          companyName: "Example Labs",
          title: "Engineer",
          startedOn: "2020-01",
        },
      ],
    });
    const second = profileImportDigest({
      positions: [
        {
          startedOn: "2020-01",
          title: "Engineer",
          companyName: "Example Labs",
        },
      ],
      name: "Ada Morgan",
    });

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toBe(first);
  });

  it("binds the preview to the current anchor profile", () => {
    const patch = { name: "Ada Morgan" };
    const original = profileImportPreviewDigest(
      patch,
      "---\nname: Unknown\n---\n",
    );

    expect(
      profileImportPreviewDigest(patch, "---\nname: Owner Edit\n---\n"),
    ).not.toBe(original);
    expect(
      profileImportPreviewDigest(
        { name: "Ada Lovelace" },
        "---\nname: Unknown\n---\n",
      ),
    ).not.toBe(original);
  });

  it("changes when previewed values or array order change", () => {
    const original = profileImportDigest({
      name: "Ada Morgan",
      skills: ["TypeScript", "Systems Design"],
    });

    expect(
      profileImportDigest({
        name: "Ada Morgan",
        skills: ["Systems Design", "TypeScript"],
      }),
    ).not.toBe(original);
    expect(
      profileImportDigest({
        name: "Ada Lovelace",
        skills: ["TypeScript", "Systems Design"],
      }),
    ).not.toBe(original);
  });
});
