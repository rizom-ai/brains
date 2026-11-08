import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { WidgetFilter, WidgetTabs } from "./WidgetPrimitives";

const tabs = [
  { value: "all", label: "All", count: 3, content: <p>every item</p> },
  { value: "open", label: "Open", count: 1, content: <p>open items</p> },
];

function attributesOf(html: string, marker: string): string {
  const match = html.match(new RegExp(`<[^>]*${marker}[^>]*>`));
  if (!match) throw new Error(`no element carrying ${marker}`);
  return match[0];
}

describe("WidgetTabs", () => {
  it("ties every tab to the panel it controls, both ways", () => {
    const html = renderToStaticMarkup(
      <WidgetTabs id="w" label="Views" defaultValue="all" tabs={tabs} />,
    );

    // A screen reader follows aria-controls out and aria-labelledby back; if
    // either id is wrong the tab and its panel stop being one control.
    for (const tab of tabs) {
      expect(attributesOf(html, `data-ui-tab="${tab.value}"`)).toContain(
        `aria-controls="w-panel-${tab.value}"`,
      );
      expect(attributesOf(html, `data-ui-panel="${tab.value}"`)).toContain(
        `aria-labelledby="w-tab-${tab.value}"`,
      );
    }
  });

  it("marks exactly the default tab selected", () => {
    const html = renderToStaticMarkup(
      <WidgetTabs id="w" label="Views" defaultValue="open" tabs={tabs} />,
    );

    expect(attributesOf(html, 'data-ui-tab="open"')).toContain(
      'aria-selected="true"',
    );
    expect(attributesOf(html, 'data-ui-tab="all"')).toContain(
      'aria-selected="false"',
    );
  });

  it("hides every panel but the default one", () => {
    const html = renderToStaticMarkup(
      <WidgetTabs id="w" label="Views" defaultValue="open" tabs={tabs} />,
    );

    expect(attributesOf(html, 'data-ui-panel="open"')).not.toContain("hidden");
    expect(attributesOf(html, 'data-ui-panel="all"')).toContain("hidden");
  });

  it("publishes the default so the client script starts where the server did", () => {
    const html = renderToStaticMarkup(
      <WidgetTabs id="w" label="Views" defaultValue="open" tabs={tabs} />,
    );

    // The markup is server-rendered and taken over by a script; without this
    // the script cannot know which tab is already showing.
    expect(html).toContain('data-ui-tabs-default="open"');
  });

  it("carries a state attribute only when asked to", () => {
    const withState = renderToStaticMarkup(
      <WidgetTabs
        id="w"
        label="Views"
        defaultValue="all"
        tabs={tabs}
        stateAttribute="data-view"
      />,
    );
    const without = renderToStaticMarkup(
      <WidgetTabs id="w" label="Views" defaultValue="all" tabs={tabs} />,
    );

    expect(withState).toContain('data-ui-tabs-state-attribute="data-view"');
    expect(without).not.toContain("data-ui-tabs-state-attribute");
  });

  it("labels the tab strip for anyone who cannot see it", () => {
    const html = renderToStaticMarkup(
      <WidgetTabs id="w" label="Views" defaultValue="all" tabs={tabs} />,
    );

    expect(attributesOf(html, 'role="tablist"')).toContain(
      'aria-label="Views"',
    );
  });

  it("renders the same contract in either variant", () => {
    for (const variant of ["line", "pill"] as const) {
      const html = renderToStaticMarkup(
        <WidgetTabs
          id="w"
          label="Views"
          defaultValue="all"
          tabs={tabs}
          variant={variant}
        />,
      );
      expect(html).toContain('role="tablist"');
      expect(attributesOf(html, 'data-ui-tab="all"')).toContain(
        'aria-controls="w-panel-all"',
      );
    }
  });
});

describe("WidgetFilter", () => {
  const options = [
    { value: "all", label: "All", count: 2 },
    { value: "done", label: "Done", count: 1 },
  ];

  it("publishes the default and the all-value the client script needs", () => {
    const html = renderToStaticMarkup(
      <WidgetFilter label="Status" defaultValue="all" options={options}>
        <p>items</p>
      </WidgetFilter>,
    );

    // Server-rendered then taken over by a script: without these it cannot
    // know which option is showing, or which one means "no filter".
    expect(html).toContain('data-ui-filter-default="all"');
    expect(html).toContain('data-ui-filter-all="all"');
  });

  it("names a different all-value when one is given", () => {
    const html = renderToStaticMarkup(
      <WidgetFilter
        label="Status"
        defaultValue="everything"
        allValue="everything"
        options={options}
      >
        <p>items</p>
      </WidgetFilter>,
    );

    expect(html).toContain('data-ui-filter-all="everything"');
  });

  it("renders the children it filters", () => {
    const html = renderToStaticMarkup(
      <WidgetFilter label="Status" defaultValue="all" options={options}>
        <p>the filtered items</p>
      </WidgetFilter>,
    );

    expect(html).toContain("the filtered items");
  });
});
