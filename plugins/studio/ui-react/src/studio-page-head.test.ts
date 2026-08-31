import { describe, expect, it } from "bun:test";
import type { RuntimeStudioOperatorView } from "@brains/plugins";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { StudioWorkspaceInfo } from "./api";
import studioPageHeadStyles from "./studio-page-head.css" with { type: "text" };
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
      totals: [
        { label: "People", value: 3 },
        { label: "Attention", value: 1, tone: "warn" },
      ],
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
    expect(html).toContain("Access administration");
    expect(html).toContain("Admin only");
    expect(html).toContain("Administration");
    expect(html).toContain("3 people");
    expect(html).toContain("Healthy");
    expect(html).toContain("Invitations");
    expect(html).toContain('data-studio-primary-action="true"');
    expect(html.match(/Add person/g)).toHaveLength(1);
  });

  it("compresses the phone head to one line without dropping host access", () => {
    expect(studioPageHeadStyles).toContain(
      "grid-template-columns: minmax(0, 1fr) auto",
    );
    expect(studioPageHeadStyles).toMatch(
      /\.studio-page-head-kicker > :not\(\.studio-head-access\) \{[^}]*display: none/,
    );
    expect(studioPageHeadStyles).toMatch(
      /\.studio-page-head-description \{[^}]*display: none/,
    );
    expect(studioPageHeadStyles).toMatch(
      /\.studio-page-head h2 \{[^}]*text-overflow: ellipsis[^}]*white-space: nowrap/,
    );
    expect(studioPageHeadStyles).toContain(
      '.studio-page-head[data-has-totals="true"] .studio-head-status',
    );
    expect(studioPageHeadStyles).toMatch(
      /\.studio-page-head-action \{[^}]*position: fixed[^}]*env\(safe-area-inset-bottom\)/,
    );
    expect(studioPageHeadStyles).toContain(
      ".studio-workspace-frame:has(.studio-page-head-action)",
    );
    expect(studioPageHeadStyles).toContain(
      ".studio-page-head-action .declarative-action-form label",
    );
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
