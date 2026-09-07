import { describe, expect, it } from "bun:test";
import type { RuntimeStudioOperatorView } from "@brains/plugins";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { StudioWorkspaceInfo } from "./api";
import { createStylexBunTransform } from "@brains/build-tools";
import { Window } from "happy-dom";
import {
  declarativeStudioPageHead,
  StudioPageHead,
  studioAccessRequirement,
} from "./studio-page-head";

const workspace: StudioWorkspaceInfo = {
  id: "admin:administration",
  pluginId: "admin",
  label: "Administration",
  rendererName: "DeclarativeOperatorWorkspace",
  priority: 10,
  permission: "admin",
  entityTypes: [],
};

const view: RuntimeStudioOperatorView = {
  kicker: "Access administration",
  description: "Manage people and security history.",
  status: { label: "Healthy", detail: "No open incidents", tone: "good" },
  primaryAction: {
    actionId: "add-person",
    label: "Add person",
    input: {},
  },
  blocks: [
    {
      type: "stats",
      items: [
        { label: "People", value: 3 },
        { label: "Attention", value: 1, tone: "warn" },
      ],
    },
    {
      type: "notice",
      tone: "neutral",
      text: "Review access regularly.",
    },
  ],
};

describe("Studio page-head normalization", () => {
  it("derives access wording only from the host-enforced floor", () => {
    expect(studioAccessRequirement("public")).toEqual({
      kind: "session",
      label: "Signed in",
    });
    expect(studioAccessRequirement("trusted")).toEqual({
      kind: "permission",
      label: "Trusted",
    });
    expect(studioAccessRequirement("admin")).toEqual({
      kind: "permission",
      label: "Admin only",
    });
  });

  it("maps current declarative semantics without consuming their blocks", () => {
    const head = declarativeStudioPageHead(workspace, view);

    expect(head).toEqual({
      kicker: "Access administration",
      access: { kind: "permission", label: "Admin only" },
      title: "Administration",
      description: "Manage people and security history.",
      status: { label: "Healthy", detail: "No open incidents", tone: "good" },
      totals: [],
      primaryAction: {
        actionId: "add-person",
        label: "Add person",
        input: {},
      },
    });
    expect(view.blocks).toHaveLength(2);
  });

  it("renders one bounded head grammar with host and source semantics", () => {
    const html = renderToStaticMarkup(
      createElement(StudioPageHead, {
        model: {
          kicker: "Access administration",
          access: { kind: "permission", label: "Admin only" },
          title: "Administration",
          metadata: ["3 people", "1 needs attention"],
          description: "Manage people and security history.",
          status: { label: "Healthy", tone: "good" },
          totals: [{ label: "Invitations", value: 1, tone: "warn" }],
        },
        action: createElement("button", { type: "button" }, "Add person"),
      }),
    );

    expect(html).toContain('data-studio-page-head="true"');
    expect(html).toContain('data-has-totals="true"');
    expect(html).not.toContain("Access administration");
    expect(html).not.toContain("Admin only");
    expect(html).not.toContain("studio-head-chip");
    expect(html).toContain("Administration");
    expect(html).toContain("3 people");
    expect(html).toContain("Healthy");
    expect(html).toContain("Invitations");
    expect(html).toContain('data-studio-primary-action="true"');
    expect(html.match(/Add person/g)).toHaveLength(1);
  });

  it("keeps actionable warning details without turning them into pills", () => {
    const html = renderToStaticMarkup(
      createElement(StudioPageHead, {
        model: {
          title: "Publishing",
          access: studioAccessRequirement("trusted"),
          totals: [],
          status: {
            label: "Blocked",
            detail: "Connect a publishing destination",
            tone: "warn",
          },
        },
      }),
    );
    expect(html).toContain("Blocked");
    expect(html).toContain("Connect a publishing destination");
    expect(html).toContain('data-tone="warn"');
    expect(html).not.toContain("studio-head-chip");
  });

  it("compiles the approved heading hierarchy and keeps primary actions in the head at both widths", async () => {
    const transform = createStylexBunTransform();
    const build = await Bun.build({
      entrypoints: [
        new URL("./studio-page-head.styles.ts", import.meta.url).pathname,
      ],
      plugins: [transform.plugin],
      external: ["@stylexjs/stylex"],
      target: "browser",
    });
    expect(build.success).toBe(true);
    expect(transform.css()).toContain("-webkit-line-clamp:2");
    for (const [width, size] of [
      [1440, "36px"],
      [390, "29px"],
    ] as const) {
      const window = new Window({ width });
      try {
        window.document.head.innerHTML = `<style>:root{--console-display:Georgia;--console-text:#222}${transform.css()}</style>`;
        window.document.body.innerHTML = renderToStaticMarkup(
          createElement(StudioPageHead, {
            model: {
              title: "Content sync",
              access: studioAccessRequirement("admin"),
              totals: [],
            },
            action: createElement("button", { type: "button" }, "Sync now"),
          }),
        );
        const title = window.document.querySelector("h1");
        const action = window.document.querySelector(
          ".studio-page-head-action",
        );
        if (!title || !action)
          throw new Error("Missing page heading or primary action");
        expect(window.getComputedStyle(title).fontSize).toBe(size);
        expect(window.getComputedStyle(title).fontWeight).toBe("600");
        expect(window.getComputedStyle(action).position).toBe("relative");
      } finally {
        await window.happyDOM.abort();
      }
    }
  });

  it("prefers a source title and otherwise falls back to the admitted workspace", () => {
    expect(
      declarativeStudioPageHead(workspace, { title: "People", blocks: [] })
        .title,
    ).toBe("People");
    expect(declarativeStudioPageHead(workspace, { blocks: [] }).title).toBe(
      "Administration",
    );
  });
});
