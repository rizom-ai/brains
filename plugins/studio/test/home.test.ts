import { describe, expect, it } from "bun:test";
import {
  DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
  studioOverviewContributionSchema,
  type StudioOverviewContributionRegistration,
} from "@brains/plugins";
import { composeStudioHome, type StudioHomeInput } from "../src/home";
import type { BrainFacts, LoadedContribution } from "../src/overview-workspace";

const NOW = new Date("2026-11-26T17:03:00.000Z");
const healthy: BrainFacts = {
  runtime: "operational",
  degraded: false,
  activeJobs: 0,
  failedJobs: 0,
  version: "1.0.0",
  interactions: 0,
  channels: 0,
  inboxSources: 0,
  entityTypes: 0,
};

function pipeline(attention: number): LoadedContribution {
  const registration: StudioOverviewContributionRegistration = {
    id: "publication-pipeline",
    pluginId: "content-pipeline",
    title: "Publishing",
    group: "publishing",
    rendererName: DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
    section: "primary",
    priority: 20,
    visibility: "trusted",
    dataProvider: async () => ({}),
  };
  return {
    contribution: studioOverviewContributionSchema.parse(registration),
    data: {
      view: {
        blocks: [
          {
            type: "links",
            items: [
              {
                label: "Open publishing",
                target: { kind: "launch", launch: { target: "publishing" } },
              },
            ],
          },
        ],
      },
    },
    digest: [
      { label: "Failed", value: "LinkedIn rejected 1 post", tone: "warn" },
    ],
    attention,
    failed: false,
  };
}

function input(overrides: Partial<StudioHomeInput> = {}): StudioHomeInput {
  return {
    now: NOW,
    workspaceAttention: [],
    pluginsWithAttention: new Set(),
    contributions: [],
    failedJobs: [],
    drafts: [],
    published: [],
    facts: healthy,
    paths: {
      workspace: (id, query) =>
        `/studio/workspaces/${id}${query ? `?${new URLSearchParams(query)}` : ""}`,
      history: "/studio/workspaces/studio%3Ahistory",
      pluginPage: (pluginId) =>
        pluginId === "content-pipeline"
          ? "/studio/workspaces/publishing"
          : undefined,
    },
    ...overrides,
  };
}

describe("Home", () => {
  it("lists only what needs the person, failures first, each with its verb", () => {
    const home = composeStudioHome(
      input({
        workspaceAttention: [
          {
            workspaceId: "inbox",
            pluginId: "unified-inbox",
            label: "Inbox",
            items: [
              {
                id: "open",
                title: "2 replies in your inbox",
                severity: "warn",
                action: { label: "Open inbox", query: { filter: "open" } },
              },
            ],
          },
        ],
        contributions: [pipeline(1)],
        failedJobs: [
          {
            id: "job-site-build",
            at: "2026-11-26T16:40:00.000Z",
            title: "Site build failed",
            description: "Preview render failed.",
            metadata: ["Job activity"],
            tone: "error",
          },
        ],
      }),
    );
    expect(home.needsYou).toEqual([
      {
        id: "job:job-site-build",
        title: "Site build failed",
        detail: "Preview render failed.",
        severity: "error",
        source: "Jobs",
        action: {
          label: "See history",
          href: "/studio/workspaces/studio%3Ahistory",
        },
      },
      {
        id: "inbox:open",
        title: "2 replies in your inbox",
        severity: "warn",
        source: "Inbox",
        action: {
          label: "Open inbox",
          href: "/studio/workspaces/inbox?filter=open",
        },
      },
      {
        id: "content-pipeline:publication-pipeline",
        title: "Publishing",
        detail: "Failed: LinkedIn rejected 1 post",
        severity: "warn",
        source: "Publishing",
        action: {
          label: "Open publishing",
          href: "/studio/workspaces/publishing",
        },
      },
    ]);
  });

  it("leaves a source's widget out when its workspace says what needs the person", () => {
    const home = composeStudioHome(
      input({
        contributions: [pipeline(2)],
        pluginsWithAttention: new Set(["content-pipeline"]),
      }),
    );
    expect(home.needsYou).toEqual([]);
  });

  it("leaves out sources with nothing waiting", () => {
    expect(
      composeStudioHome(input({ contributions: [pipeline(0)] })).needsYou,
    ).toEqual([]);
  });

  it("carries drafts and what went out, as given", () => {
    const draft = {
      id: "urban-sensing",
      entityType: "post",
      typeLabel: "Post",
      title: "Urban Sensing Networks",
      href: "/studio/entities/post/urban-sensing",
      updated: "2026-11-26T15:00:00.000Z",
    };
    const home = composeStudioHome(input({ drafts: [draft] }));
    expect(home.drafts).toEqual([draft]);
    expect(home.now).toBe("2026-11-26T17:03:00.000Z");
  });

  it("says the brain's health in one line, worst first", () => {
    expect(composeStudioHome(input()).status).toEqual({
      tone: "good",
      text: "Brain running.",
      history: {
        label: "History",
        href: "/studio/workspaces/studio%3Ahistory",
      },
    });
    expect(
      composeStudioHome(input({ facts: { ...healthy, activeJobs: 2 } })).status
        .text,
    ).toBe("Brain running. 2 jobs in progress.");
    expect(
      composeStudioHome(input({ facts: { ...healthy, failedJobs: 1 } })).status,
    ).toMatchObject({ tone: "warn", text: "Brain running. 1 job failed." });
    expect(
      composeStudioHome(input({ facts: { ...healthy, degraded: true } }))
        .status,
    ).toMatchObject({ tone: "error", text: "Brain degraded." });
  });
});
