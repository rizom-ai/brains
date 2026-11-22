/** @jsxImportSource react */

import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ObsidianConnectCard,
  obsidianConnectLink,
  parseObsidianConnect,
} from "./obsidian-connect";

const created = {
  id: "k3x9",
  username: "dav-k3x9",
  password: "s3cret pass&word",
  label: "Obsidian",
  access: "write" as const,
  createdAt: 1_735_689_600,
  expiresAt: 4_102_444_800,
};

describe("connecting Obsidian", () => {
  it("takes a Connect request only from Obsidian, with a plain state", () => {
    expect(
      parseObsidianConnect(
        "?section=drive&connect=obsidian&state=ab12cd34ef56",
      ),
    ).toEqual({ state: "ab12cd34ef56" });
    expect(parseObsidianConnect("?section=drive")).toBeUndefined();
    expect(
      parseObsidianConnect("?connect=elsewhere&state=ab12cd34ef56"),
    ).toBeUndefined();
    expect(
      parseObsidianConnect("?connect=obsidian&state=<script>"),
    ).toBeUndefined();
    expect(parseObsidianConnect("?connect=obsidian&state=ab")).toBeUndefined();
  });

  it("hands the app password back to Obsidian with the state it sent", () => {
    const link = new URL(obsidianConnectLink("ab12cd34ef56", created));

    expect(link.protocol).toBe("obsidian:");
    expect(link.host + link.pathname).toBe("brain-sync");
    expect(link.searchParams.get("state")).toBe("ab12cd34ef56");
    expect(link.searchParams.get("username")).toBe("dav-k3x9");
    expect(link.searchParams.get("password")).toBe("s3cret pass&word");
  });

  it("asks before it creates anything, and says what Connect creates", () => {
    const html = renderToStaticMarkup(
      createElement(ObsidianConnectCard, {
        connect: { state: "ab12cd34ef56" },
        created: null,
        busy: false,
        onConnect: () => undefined,
      }),
    );

    expect(html).toContain("Connect Obsidian");
    expect(html).toContain("may save changes");
    expect(html).toContain(">Connect Obsidian</button>");
    expect(html).not.toContain("obsidian://");
  });

  it("offers to open Obsidian once the app password exists, without showing the password", () => {
    const html = renderToStaticMarkup(
      createElement(ObsidianConnectCard, {
        connect: { state: "ab12cd34ef56" },
        created,
        busy: false,
        onConnect: () => undefined,
      }),
    );

    expect(html).toContain("Open Obsidian");
    expect(html).toContain('href="obsidian://brain-sync?');
    expect(html).not.toContain(">s3cret");
  });
});
