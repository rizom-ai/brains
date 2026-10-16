import { describe, expect, it } from "bun:test";
import { accountFixture, studioWorkspaces } from "./studio-fixtures";

describe("accountFixture", () => {
  it("connects a channel, a mailbox, and two sessions by default", () => {
    const account = accountFixture(undefined);
    expect(account).not.toHaveProperty("profileEntityId");
    expect(account["connectedChannels"]).toHaveLength(1);
    expect(account["pluginSettings"]).toHaveLength(1);
    expect(account["sessions"]).toHaveLength(2);
  });

  it("keeps only the Anchor profile, final passkey, and current session when empty", () => {
    const account = accountFixture("empty");
    expect(account["profileEntityId"]).toBe("anchor-profile/anchor-profile");
    expect(account["connectedChannels"]).toEqual([]);
    expect(account["pluginSettings"]).toEqual([]);
    expect(account["passkeys"]).toHaveLength(1);
    expect(account["sessions"]).toEqual([
      expect.objectContaining({ id: "session-current", current: true }),
    ]);
  });
});

describe("studioWorkspaces", () => {
  it("carries the Overview and Administration badges their providers report", () => {
    const workspaces = studioWorkspaces({ overview: 4, administration: 2 });
    const badge = (id: string): unknown =>
      workspaces.find((workspace) => workspace["id"] === id)?.["badge"];
    expect(badge("studio:overview")).toBe(4);
    expect(badge("admin:administration")).toBe(2);
    expect(badge("unified-inbox:inbox")).toBe(3);
    expect(workspaces.map((workspace) => workspace["id"])).toEqual([
      "studio:overview",
      "web-chat:chat",
      "unified-inbox:inbox",
      "content-pipeline:publishing",
      "site-builder:site",
      "directory-sync:sync",
      "admin:administration",
      "studio:account",
    ]);
  });
});
