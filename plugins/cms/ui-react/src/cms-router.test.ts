import { describe, expect, it } from "bun:test";
import { createMemoryHistory } from "@tanstack/react-router";
import { cmsEntityPath, parseCmsPath } from "../../src/cms-paths";
import { createCmsRouter } from "./cms-router";

describe("CMS browser router", () => {
  it("uses the configured base and replays Back and Forward entries", async () => {
    const history = createMemoryHistory({
      initialEntries: ["/studio/entities/post"],
    });
    const router = createCmsRouter("/studio", undefined, history);
    await router.load();

    history.push(cmsEntityPath("/studio", "post", "field-notes"));
    expect(parseCmsPath(history.location.pathname, "/studio")).toEqual({
      kind: "entity",
      entityType: "post",
      id: "field-notes",
    });

    history.back();
    expect(history.location.pathname).toBe("/studio/entities/post");
    history.forward();
    expect(history.location.pathname).toBe("/studio/entities/post/field-notes");
  });
});
