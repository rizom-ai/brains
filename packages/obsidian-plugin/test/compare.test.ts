import { describe, expect, it } from "bun:test";
import { compareVersions } from "../src/obsidian/compare";

/** What the conflict screen shows: two versions, with what differs marked. */
describe("two versions side by side", () => {
  it("marks the lines one version has and the other has not", () => {
    const compared = compareVersions(
      "# Tea\n\nFrom Studio.\nSteep it.\n",
      "# Tea\n\nFrom Obsidian.\nSteep it.\n",
    );

    expect(compared.brains).toEqual([
      { text: "# Tea", differs: false },
      { text: "", differs: false },
      { text: "From Studio.", differs: true },
      { text: "Steep it.", differs: false },
    ]);
    expect(compared.yours).toEqual([
      { text: "# Tea", differs: false },
      { text: "", differs: false },
      { text: "From Obsidian.", differs: true },
      { text: "Steep it.", differs: false },
    ]);
  });

  it("marks a line one version has more often", () => {
    const compared = compareVersions("- tea\n", "- tea\n- tea\n");

    expect(compared.brains).toEqual([{ text: "- tea", differs: false }]);
    expect(compared.yours).toEqual([
      { text: "- tea", differs: false },
      { text: "- tea", differs: true },
    ]);
  });

  it("marks nothing in versions that are the same", () => {
    const compared = compareVersions("# Tea\n", "# Tea\n");

    expect(compared.brains.some((line) => line.differs)).toBe(false);
    expect(compared.yours.some((line) => line.differs)).toBe(false);
  });

  it("reads Windows line endings as lines", () => {
    const compared = compareVersions("# Tea\r\nSteep.\r\n", "# Tea\nSteep.\n");

    expect(compared.brains.map((line) => line.text)).toEqual([
      "# Tea",
      "Steep.",
    ]);
    expect(compared.brains.some((line) => line.differs)).toBe(false);
  });

  it("shows an empty version as no lines", () => {
    const compared = compareVersions("", "# Tea\n");

    expect(compared.brains).toEqual([]);
    expect(compared.yours).toEqual([{ text: "# Tea", differs: true }]);
  });
});
