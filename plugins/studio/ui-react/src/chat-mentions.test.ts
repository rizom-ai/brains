import { describe, expect, it } from "bun:test";
import { chatStarters, linkCitedTitles, sourceHref } from "./chat-mentions";

const resilience = {
  id: "post:resilience",
  title: "Resilience Is Not Redundancy",
  source: "system_get",
  entityType: "post",
  entityId: "resilience",
};

// An answer that names an entry it drew on links to it in Studio.
describe("linked mentions", () => {
  it("links the first plain mention of each cited entry to Studio", () => {
    expect(
      linkCitedTitles(
        "Read Resilience Is Not Redundancy first; Resilience Is Not Redundancy explains why.",
        [resilience],
        "/studio",
      ),
    ).toBe(
      "Read [Resilience Is Not Redundancy](/studio/entities/post/resilience) first; Resilience Is Not Redundancy explains why.",
    );
  });

  it("leaves code, existing links and sources without an entry alone", () => {
    expect(
      linkCitedTitles(
        "`Resilience Is Not Redundancy` and [Resilience Is Not Redundancy](https://x.test)",
        [resilience],
        "/studio",
      ),
    ).toBe(
      "`Resilience Is Not Redundancy` and [Resilience Is Not Redundancy](https://x.test)",
    );
    expect(
      linkCitedTitles(
        "A web page",
        [{ id: "web", title: "A web page", source: "web" }],
        "/studio",
      ),
    ).toBe("A web page");
  });

  it("opens a cited entry in Studio, and anything else where it lives", () => {
    expect(sourceHref(resilience, "/studio")).toBe(
      "/studio/entities/post/resilience",
    );
    expect(
      sourceHref(
        { id: "web", source: "web", url: "https://x.test" },
        "/studio",
      ),
    ).toBe("https://x.test");
    expect(sourceHref({ id: "web", source: "web" }, "/studio")).toBeUndefined();
  });
});

// A new conversation offers what this brain can do, not a blank page.
describe("starters", () => {
  it("offers what the installed pages and types make possible", () => {
    expect(
      chatStarters({
        types: ["post", "note"],
        workspaces: ["unified-inbox:inbox", "content-pipeline:publishing"],
      }),
    ).toEqual([
      "Summarize what is in my inbox this week",
      "What did I publish last month?",
      "Draft a post from my recent notes",
      "What have I been writing about lately?",
    ]);
    expect(chatStarters({ types: [], workspaces: [] })).toEqual([
      "What can you help me with?",
    ]);
  });
});
