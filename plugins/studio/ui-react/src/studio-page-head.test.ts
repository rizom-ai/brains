import { describe, expect, it } from "bun:test";
import type { RuntimeStudioOperatorView } from "@brains/plugins";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { StudioWorkspaceInfo } from "./api";
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
    expect(html).toContain("Access administration");
    expect(html).toContain("Admin only");
    expect(html).toContain("Administration");
    expect(html).toContain("3 people");
    expect(html).toContain("Healthy");
    expect(html).toContain("Invitations");
    expect(html).toContain("Add person");
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
