import { describe, expect, it } from "bun:test";
import { formatAgentBody, parseAgentBody } from "../../src/a2a/agent-body";

const empty = { about: "", skills: [], notes: "" };

describe("agent body", () => {
  it("parses what it formats, skill tags included", () => {
    const body = {
      about: "Field researchers.",
      skills: [
        {
          name: "Field Notes",
          description: "Keep field notes",
          tags: ["research", "writing"],
        },
        { name: "Mapping", description: "Draw maps", tags: [] },
      ],
      notes: "Met at the summit.",
    };

    expect(parseAgentBody(formatAgentBody(body))).toEqual(body);
  });

  it("keeps the sections a hand-written body has", () => {
    expect(
      parseAgentBody(
        "## Skills\n\n- Field Notes: Keep field notes [research, writing]",
      ),
    ).toEqual({
      ...empty,
      skills: [
        {
          name: "Field Notes",
          description: "Keep field notes",
          tags: ["research", "writing"],
        },
      ],
    });
  });

  it("skips skill lines that do not read as a skill", () => {
    expect(
      parseAgentBody("## Skills\n\n- Mapping: Draw maps\nsomething else")
        .skills,
    ).toEqual([{ name: "Mapping", description: "Draw maps", tags: [] }]);
  });

  it("reads a blank body as an empty profile", () => {
    expect(parseAgentBody("  \n")).toEqual(empty);
  });
});
