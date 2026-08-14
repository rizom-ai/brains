/** @jsxImportSource preact */
import { describe, expect, it } from "bun:test";
import { render } from "preact-render-to-string";
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
      rendererName: "host-owned-declarative",
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
        cmsPath="/cms"
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
  });

  it("rejects unsafe links before the generic renderer emits HTML", () => {
    const html = render(
      <DeclarativeWidgetBody
        cmsPath="/cms"
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
});
