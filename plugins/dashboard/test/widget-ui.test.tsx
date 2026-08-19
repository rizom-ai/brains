/** @jsxImportSource preact */
import { describe, expect, it } from "bun:test";
import { render } from "preact-render-to-string";
import { normalizeRendererHtml } from "@brains/test-utils";
import {
  createWidgetInstanceId,
  WidgetActionLink,
  WidgetActions,
  WidgetFilter,
  WidgetList,
  WidgetListItem,
  WidgetTabs,
} from "@brains/ui-library";
import { DeclarativeWidgetBody } from "../src/render/declarative-widget";
import type { RenderableWidgetData } from "../src/render/types";

function declarativeWidget(data: unknown): RenderableWidgetData {
  return {
    widget: {
      id: "declarative",
      pluginId: "fixture",
      title: "Declarative widget",
      group: "knowledge",
      priority: 10,
      section: "secondary",
      rendererName: "DeclarativeOperatorWidget",
      visibility: "trusted",
    },
    data,
  };
}

describe("widget UI primitives", () => {
  it("creates stable DOM-safe widget instance ids", () => {
    expect(createWidgetInstanceId("Agent Discovery", "Network/Main")).toBe(
      "widget-agent-discovery-network-main",
    );
  });

  it("renders consistent primary and external widget actions", () => {
    const html = render(
      <WidgetActions label="Publishing actions">
        <WidgetActionLink href="/cms" emphasis="primary">
          Open in CMS
        </WidgetActionLink>
        <WidgetActionLink href="https://preview.example" external>
          Open preview
        </WidgetActionLink>
      </WidgetActions>,
    );

    expect(html).toContain('class="widget-actions"');
    expect(html).toContain('class="widget-action widget-action--primary"');
    expect(html).toContain('href="/cms"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer"');
    expect(html).toContain("↗");
  });

  it("renders linked tab and panel semantics from one definition", () => {
    const html = render(
      <WidgetTabs
        id="widget-example-views"
        label="Example views"
        defaultValue="first"
        tabs={[
          { value: "first", label: "First", content: <p>First panel</p> },
          { value: "second", label: "Second", content: <p>Second panel</p> },
        ]}
      />,
    );

    expect(html).toContain('id="widget-example-views-tab-first"');
    expect(html).toContain('aria-controls="widget-example-views-panel-first"');
    expect(html).toContain('aria-labelledby="widget-example-views-tab-second"');
    expect(html).toContain('data-ui-tabs-default="first"');
    expect(html).toContain('data-ui-panel="second"');
    expect(html).toContain("hidden");
  });

  it("renders validated declarative views with host-owned entity links", () => {
    const html = render(
      <DeclarativeWidgetBody
        launchPaths={{ cmsPath: "/cms" }}
        widget={declarativeWidget({
          view: {
            title: "Queue <script>alert('nope')</script>",
            blocks: [
              {
                type: "table",
                id: "queue",
                columns: [
                  { key: "title", label: "Title" },
                  { key: "state", label: "State" },
                ],
                rows: [
                  {
                    id: "row-1",
                    cells: { title: "First", state: "ready" },
                    link: {
                      kind: "entity",
                      entityType: "bookmark",
                      id: "saved-1",
                    },
                  },
                ],
                empty: "No rows.",
              },
            ],
          },
        })}
      />,
    );

    expect(html).toContain("Queue &lt;script>alert('nope')&lt;/script>");
    expect(html).not.toContain("<script>alert('nope')</script>");
    expect(html).toContain('class="operator-table"');
    expect(html).toContain('href="/cms/entities/bookmark/saved-1"');
    expect(
      normalizeRendererHtml(html, { ignoreImagePreloads: true }),
    ).toMatchSnapshot();
  });

  it("resolves closed CMS launch intents to scoped declarative workspaces", () => {
    const html = render(
      <DeclarativeWidgetBody
        launchPaths={{ cmsPath: "/cms" }}
        widget={declarativeWidget({
          view: {
            blocks: [
              {
                type: "links",
                items: [
                  {
                    label: "Publishing",
                    target: {
                      kind: "launch",
                      launch: { target: "publishing" },
                    },
                  },
                  {
                    label: "Site",
                    target: {
                      kind: "launch",
                      launch: { target: "site" },
                    },
                  },
                  {
                    label: "Inbox",
                    target: {
                      kind: "launch",
                      launch: { target: "inbox" },
                    },
                  },
                ],
              },
            ],
          },
        })}
      />,
    );

    expect(html).toContain(
      'href="/cms/workspaces/content-pipeline%3Apublishing"',
    );
    expect(html).toContain('href="/cms/workspaces/site-builder%3Asite"');
    expect(html).toContain('href="/cms/workspaces/unified-inbox%3Ainbox"');
  });

  it("renders normalized spatial semantics with keyboard-focusable points and text detail", () => {
    const html = render(
      <DeclarativeWidgetBody
        launchPaths={{}}
        widget={declarativeWidget({
          view: {
            blocks: [
              {
                type: "spatial",
                layout: "radial",
                id: "network",
                label: "Agent proximity",
                description: "Agents arranged by semantic distance.",
                centerLabel: "Brain identity",
                centerKind: "identity",
                points: [
                  {
                    id: "agent-a",
                    label: "Agent A",
                    kind: "person",
                    status: "approved",
                    distance: 0.25,
                    bearing: 90,
                    relatedIds: ["agent-b"],
                    tone: "good",
                  },
                  {
                    id: "agent-b",
                    label: "Agent B",
                    kind: "team",
                    status: "discovered",
                    distance: 0.7,
                    bearing: 220,
                    relatedIds: ["agent-a"],
                    tone: "warn",
                  },
                ],
                relationships: [
                  {
                    sourceId: "agent-a",
                    targetId: "agent-b",
                    tone: "good",
                  },
                ],
                strata: [
                  { id: "near", label: "Near", maxDistance: 0.5 },
                  { id: "far", label: "Far", maxDistance: 1 },
                ],
                legend: [
                  { label: "Approved", tone: "good" },
                  { label: "Pending", tone: "warn" },
                ],
              },
            ],
          },
        })}
      />,
    );

    expect(html).toContain('data-ui-spatial="true"');
    expect(html).toContain('data-ui-spatial-point="agent-a"');
    expect(html).toContain('aria-controls="network-detail-agent-a"');
    expect(html).toContain("Agents arranged by semantic distance.");
    expect(html).toContain("person · approved");
  });

  it("renders host-owned grouping, flow, meters, and active progress", () => {
    const html = render(
      <DeclarativeWidgetBody
        launchPaths={{}}
        widget={declarativeWidget({
          view: {
            blocks: [
              {
                type: "group",
                id: "automation",
                label: "Automation",
                items: [{ id: "watcher", label: "Watcher", value: true }],
              },
              {
                type: "flow",
                id: "pipeline",
                label: "Content flow",
                direction: "bidirectional",
                steps: [
                  { id: "files", label: "Files", status: "complete" },
                  { id: "store", label: "Store", status: "active" },
                ],
              },
              {
                type: "meters",
                id: "health",
                items: [{ id: "routes", label: "Routes", value: 4, max: 10 }],
              },
              {
                type: "progress",
                id: "build",
                label: "Preview build",
                state: "building",
                progress: 0.5,
              },
            ],
          },
        })}
      />,
    );

    expect(html).toContain("Automation");
    expect(html).toContain('data-direction="bidirectional"');
    expect(html).toContain('data-status="active"');
    expect(html).toContain('<progress value="4" max="10">');
    expect(html).toContain("Preview build");
    expect(html).toContain('value="0.5"');
  });

  it("rejects unsafe links before the generic renderer emits HTML", () => {
    const html = render(
      <DeclarativeWidgetBody
        launchPaths={{ cmsPath: "/cms" }}
        widget={declarativeWidget({
          view: {
            blocks: [
              {
                type: "links",
                items: [
                  {
                    label: "Unsafe",
                    target: { kind: "external", href: "javascript:alert(1)" },
                  },
                ],
              },
            ],
          },
        })}
      />,
    );

    expect(html).toContain("Widget data is unavailable.");
    expect(html).not.toContain("javascript:alert(1)");
  });

  it("renders declarative filter controls and row values", () => {
    const html = render(
      <WidgetFilter
        label="Filter examples"
        defaultValue="all"
        options={[
          { value: "all", label: "All", count: 1 },
          { value: "research", label: "Research", count: 1 },
        ]}
        emptyState="No matching examples."
      >
        <WidgetList>
          <WidgetListItem
            title="Research agent"
            filterValues={["research", "writing"]}
          />
        </WidgetList>
      </WidgetFilter>,
    );

    expect(html).toContain('data-ui-filter-default="all"');
    expect(html).toContain('data-ui-filter-all="all"');
    expect(html).toContain('data-ui-filter-value="research"');
    expect(html).toContain(
      'data-ui-filter-values="[&quot;research&quot;,&quot;writing&quot;]"',
    );
    expect(html).toContain('data-ui-filter-empty="true" hidden');
    expect(html).toContain("No matching examples.");
  });

  it("renders searchable overflow controls without truncating filter options", () => {
    const options = [
      { value: "all", label: "All" },
      ...Array.from({ length: 60 }, (_, index) => ({
        value: `tag-${String(index + 1).padStart(2, "0")}`,
        label: `Tag ${index + 1}`,
      })),
    ];

    const html = render(
      <WidgetFilter
        label="Filter skills by tag"
        defaultValue="all"
        options={options}
      >
        <WidgetList />
      </WidgetFilter>,
    );

    expect(html).toContain('data-ui-filter-visible-options="12"');
    expect(html).toContain('data-ui-filter-search="true"');
    expect(html).toContain('data-ui-filter-toggle="true"');
    expect(html).toContain('data-ui-filter-option-label="tag 60"');
    expect(html).toContain('data-ui-filter-value="tag-60"');
  });
});
