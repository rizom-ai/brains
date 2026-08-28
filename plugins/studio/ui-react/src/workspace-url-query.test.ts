import { describe, expect, it } from "bun:test";
import {
  initialWorkspaceUrlQuery,
  replaceWorkspaceUrlQuery,
  workspaceUrlHref,
  workspaceUrlSearch,
} from "./workspace-url-query";

describe("workspace URL queries", () => {
  it("initializes only opted-in workspaces from stable URL fields", () => {
    const search =
      "?sourceId=mail-items&urgency=high&offset=50&limit=25&facet.category=work";

    expect(initialWorkspaceUrlQuery({ urlQuery: true }, search)).toEqual({
      sourceId: "mail-items",
      urgency: "high",
      "facet.category": "work",
    });
    expect(initialWorkspaceUrlQuery({}, search)).toEqual({});
  });

  it("serializes canonical filters deterministically without transient paging", () => {
    const query = {
      urgency: "high",
      offset: 100,
      sourceId: "mail items",
      limit: 50,
      "facet.category": "work",
    };

    expect(workspaceUrlSearch(query)).toBe(
      "?facet.category=work&sourceId=mail+items&urgency=high",
    );
    expect(workspaceUrlHref("/studio/workspaces/inbox", query)).toBe(
      "/studio/workspaces/inbox?facet.category=work&sourceId=mail+items&urgency=high",
    );
  });

  it("replaces rather than pushes when canonical filters change", () => {
    const calls: string[] = [];
    replaceWorkspaceUrlQuery(
      { replace: (href) => calls.push(href) },
      "/studio/workspaces/inbox",
      { urgency: "normal", offset: 50 },
      "/studio/workspaces/inbox",
    );

    expect(calls).toEqual(["/studio/workspaces/inbox?urgency=normal"]);
  });

  it("never rewrites a route the operator has already navigated away to", () => {
    const calls: string[] = [];

    // A follow-up launch pushes its own destination; canonicalisation must not
    // win that race and drag the operator back to the workspace.
    replaceWorkspaceUrlQuery(
      { replace: (href) => calls.push(href) },
      "/studio/workspaces/inbox",
      { urgency: "normal" },
      "/studio/entities/note",
    );

    expect(calls).toEqual([]);
  });

  it("makes reload after transient paging start from the stable first-page query", () => {
    const pagedRequest = {
      sourceId: "mail-items",
      urgency: "normal",
      offset: 50,
      limit: 50,
    };
    const reloadedSearch = workspaceUrlSearch(pagedRequest);

    expect(reloadedSearch).toBe("?sourceId=mail-items&urgency=normal");
    expect(
      initialWorkspaceUrlQuery({ urlQuery: true }, reloadedSearch),
    ).toEqual({ sourceId: "mail-items", urgency: "normal" });
  });
});
