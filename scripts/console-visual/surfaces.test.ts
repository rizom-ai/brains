import { describe, expect, it } from "bun:test";
import { systemFixtures } from "../fixtures/studio-system";
import {
  consoleSurfaces,
  isStudioAppShellSurface,
  planSurface,
} from "./surfaces";

describe("consoleSurfaces", () => {
  it("captures every System profile except the Style guide, which studio-system covers", () => {
    const surfaces = consoleSurfaces();
    const systemProfiles = [...systemFixtures.keys()]
      .filter((key) => key !== "style-guide")
      .map((key) => `studio-system-${key}`);
    expect(surfaces).toEqual(expect.arrayContaining(systemProfiles));
    expect(surfaces).not.toContain("studio-system-style-guide");
    expect(new Set(surfaces).size).toBe(surfaces.length);
  });

  it("captures the Dashboard first and the secondary editor states last", () => {
    const surfaces = consoleSurfaces();
    expect(surfaces.slice(0, 3)).toEqual([
      "dashboard",
      "dashboard-knowledge",
      "dashboard-network",
    ]);
    expect(surfaces.slice(-4)).toEqual([
      "studio-delete",
      "studio-conflict",
      "studio-invalid",
      "studio-upload",
    ]);
  });
});

describe("planSurface", () => {
  it.each([
    ["dashboard-network", "/dashboard"],
    ["studio-library", "/studio/entities/posts"],
    ["studio-editor", "/studio/entities/posts/field-notes"],
    ["studio-upload", "/studio/entities/posts/field-notes"],
    ["studio-overview", "/studio/workspaces/studio%3Aoverview"],
    ["studio-account", "/studio/workspaces/studio%3Aaccount"],
    ["studio-chat-context", "/chat"],
    ["studio-inbox", "/studio/workspaces/unified-inbox%3Ainbox"],
    ["studio-content-sync", "/studio/workspaces/directory-sync%3Async"],
    ["studio-site", "/studio/workspaces/site-builder%3Asite"],
    ["studio-publishing", "/studio/workspaces/content-pipeline%3Apublishing"],
    [
      "studio-administration-invitations-form",
      "/studio/workspaces/admin%3Aadministration",
    ],
    ["studio-system", "/studio/entities/style-guide/style-guide"],
    ["studio-system-prompt-collection", "/studio/entities/prompt"],
    ["studio-system-agent", "/studio/entities/agent/agent"],
  ])("opens %s at %s", (surface, route) => {
    expect(planSurface(surface, undefined).route).toBe(route);
  });

  it("opens the local tab or session each surface pins", () => {
    expect(
      planSurface("studio-administration-invitations-form", undefined)
        .workspaceQuery,
    ).toBe("&tab=invitations");
    expect(
      planSurface("studio-administration-audit", undefined).workspaceQuery,
    ).toBe("&tab=audit");
    expect(planSurface("studio-chat", undefined).workspaceQuery).toBe(
      "&session=responsive",
    );
    expect(planSurface("studio-chat", "busy").workspaceQuery).toBe(
      "&session=responsive",
    );
    expect(planSurface("studio-chat", "empty").workspaceQuery).toBe("");
    expect(planSurface("studio-library", undefined).workspaceQuery).toBe("");
  });

  it("names the reviewed System type, single document or collection", () => {
    expect(planSurface("studio-system", undefined)).toMatchObject({
      reviewingSystem: true,
      systemCollection: false,
      systemType: "style-guide",
      isStudioEditor: true,
    });
    expect(
      planSurface("studio-system-agent-collection", undefined),
    ).toMatchObject({
      reviewingSystem: true,
      systemCollection: true,
      systemType: "agent",
      isStudioEditor: false,
    });
    expect(planSurface("studio-library", undefined)).toMatchObject({
      reviewingSystem: false,
      systemCollection: false,
      isStudioEditor: false,
    });
  });

  it("marks only the delete, conflict, invalid, and upload states as secondary", () => {
    expect(
      consoleSurfaces().filter(
        (surface) => planSurface(surface, undefined).isStudioSecondary,
      ),
    ).toEqual([
      "studio-delete",
      "studio-conflict",
      "studio-invalid",
      "studio-upload",
    ]);
  });
});

describe("isStudioAppShellSurface", () => {
  it("holds the editor, System documents, and secondary states as app shells", () => {
    expect(
      consoleSurfaces().filter((surface) => isStudioAppShellSurface(surface)),
    ).toEqual([
      "studio-editor",
      "studio-system",
      ...[...systemFixtures.keys()]
        .filter((key) => key !== "style-guide")
        .map((key) => `studio-system-${key}`),
      "studio-delete",
      "studio-conflict",
      "studio-invalid",
      "studio-upload",
    ]);
  });
});
