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
} from "../src/widget-ui";

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
