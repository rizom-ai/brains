import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  WidgetTabs,
  WidgetFilter,
  WidgetActions,
  WidgetActionLink,
  WidgetList,
  WidgetListItem,
  WidgetStatusPill,
  WidgetEmptyState,
} from "@brains/ui-library";
import {
  OperatorDocumentBody,
  OperatorNotice,
  OperatorActionLink,
  OperatorViewRenderer,
  OperatorDisclosure,
  OperatorColumns,
  OperatorSegmentedGroup,
  OperatorSegmentedButton,
} from "@brains/operator-view-react";
import { resolveConsoleThemeCSS } from "@brains/console-theme";
import { DASHBOARD_STYLES } from "../plugins/dashboard/src/render/styles";
import { DASHBOARD_UI_SCRIPT } from "../plugins/dashboard/src/render/ui-script";
import { spatialFixtures } from "./fixtures/operator-spatial";

// Exercise the real SSR composition and enhancer, including narrow desktop panels.
const layoutView = h(
  "section",
  { id: "renderer-layout-fixture" },
  h(OperatorViewRenderer, {
    data: {
      view: {
        title: "Authored heading",
        kicker: "Exact kicker",
        description: "Description α—/ " + "Long".repeat(60),
        status: {
          label: "Queued (0)",
          detail: "Exact status detail",
          tone: "warn",
        },
        blocks: [
          {
            type: "matrix",
            id: "matrix-probe",
            columns: 3,
            cells: (["good", "warn", "error"] as const).map((tone, index) => ({
              id: `cell-${index}`,
              label: `Cell ${index} ` + "Long".repeat(20),
              tone,
              items: [],
              empty: `Exact empty ${index}`,
            })),
          },
          {
            type: "links",
            items: [
              {
                label: "Exact external link",
                target: {
                  kind: "external",
                  href: "https://example.com/exact?q=a%2Fb#review",
                },
              },
            ],
          },
          {
            type: "list",
            id: "empty-collection",
            items: [],
            empty: "Exact empty collection",
          },
        ],
      },
    },
    onAction: async () => ({}),
    onOpenEntity: () => {},
  }),
);
const spatialViews = h(
  "section",
  { id: "spatial-fixtures" },
  h(OperatorViewRenderer, {
    data: { view: { blocks: spatialFixtures } },
    onAction: async () => ({}),
    onOpenEntity: () => {},
  }),
);
const noticeText = "Exact notice <source> α—/\n\n" + "LongNotice".repeat(25);
const notices = h(
  "section",
  { id: "notice-fixtures", style: { display: "grid", gap: 24 } },
  ...(["compact", "comfortable"] as const).flatMap((density) =>
    (["neutral", "good", "warn", "error"] as const).map((tone) =>
      h(
        "div",
        { key: `${density}-${tone}`, "data-notice-density": density },
        h(
          OperatorNotice,
          { density, tone, title: "Notice <required>", text: noticeText },
          h(
            OperatorActionLink,
            { href: "/studio?pane=exact%2Fnotice#review" },
            "Inspect notice",
          ),
        ),
      ),
    ),
  ),
);
const tabs = Array.from({ length: 8 }, (_, index) => ({
  value: `v${index}`,
  label: `Complete source tab ${index}`,
  count: index,
  content: h("p", {}, `Exact panel ${index}`),
}));
const options = Array.from({ length: 16 }, (_, index) => ({
  value: index === 0 ? "all" : `v${index}`,
  label: index === 3 ? "LongSourceLabel".repeat(20) : `Choice ${index}`,
  count: index,
  ...(index === 1 ? { tone: "gap" as const } : {}),
}));
const filter = h(WidgetFilter, {
  label: "Sources",
  defaultValue: "v14",
  options,
  emptyState: h(WidgetEmptyState, { children: "No source rows" }),
  children: h(WidgetList, {
    children: [
      h(WidgetListItem, {
        key: "row14",
        title: "FullSourceHeading".repeat(12),
        description:
          "Exact description <source> " + "LongDescription".repeat(15),
        meta: ["2026-09-09T01:02:03Z", "exact:source/identifier", "0"],
        tags: ["Full Tag <source>", "LongSourceTag".repeat(12)],
        trailing: h(WidgetStatusPill, {
          tone: "warn",
          children: "ExactStatus".repeat(12),
        }),
        filterValues: ["v14"],
        itemProps: { id: "row14", "data-origin-id": "exact:row/14" },
      }),
      h(WidgetListItem, {
        key: "row2",
        title: 0,
        description: 0,
        trailing: 0,
        meta: ["0"],
        filterValues: ["v2"],
        itemProps: { id: "row2" },
      }),
    ],
  }),
});
const actions = h(WidgetActions, {
  label: "Action links",
  children: [
    h(WidgetActionLink, {
      key: "local",
      href: "/studio?source=a%2Fb&mode=review#exact",
      emphasis: "primary",
      children: "Open Studio",
    }),
    h(WidgetActionLink, {
      key: "external",
      href: "https://preview.example/path?q=a%2Fb#section",
      external: true,
      children: "Preview",
    }),
    h(WidgetActionLink, {
      key: "long",
      href: "/long",
      children: "LongSourceActionLabel".repeat(20),
    }),
  ],
});
const form = h(OperatorViewRenderer, {
  data: {
    view: {
      blocks: [
        {
          type: "action",
          actionId: "sample",
          label: "Sample form",
          input: { sampleTotal: 0, sampleEnabled: true },
          form: {
            presentation: "disclosure",
            fields: [
              {
                name: "sampleName",
                label: "Name",
                control: "text",
                required: true,
              },
              {
                name: "sampleTotal",
                label: "Total",
                control: "number",
                required: false,
              },
              {
                name: "sampleRole",
                label: "Role",
                control: "select",
                required: true,
                options: [
                  { value: "long", label: "Unbroken".repeat(20) },
                  { value: "short", label: "Short" },
                ],
              },
              {
                name: "sampleEnabled",
                label: "Enabled",
                control: "checkbox",
                required: false,
              },
            ],
          },
        },
      ],
    },
  },
  onAction: async () => ({}),
  onOpenEntity: () => {},
});
const resultClient = await Bun.build({
  entrypoints: [
    new URL("./fixtures/operator-action-result.ts", import.meta.url).pathname,
  ],
  target: "browser",
  format: "esm",
  minify: true,
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
});
if (!resultClient.success)
  throw new AggregateError(
    resultClient.logs,
    "Action-result fixture build failed",
  );
const resultEntry = resultClient.outputs.find(
  (output) => output.kind === "entry-point",
);
if (!resultEntry) throw new Error("Missing action-result fixture entry");
const resultScript = await resultEntry.text();
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch(request) {
    if (new URL(request.url).pathname === "/action-result-fixture.js")
      return new Response(resultScript, {
        headers: { "content-type": "text/javascript" },
      });
    const climate =
      new URL(request.url).searchParams.get("climate") === "paper"
        ? "paper"
        : "instrument";
    const variant =
      new URL(request.url).searchParams.get("variant") === "pill"
        ? "pill"
        : "line";
    return new Response(
      `<!doctype html><html data-climate="${climate}"><head><meta charset="utf-8"><style>${resolveConsoleThemeCSS()}${DASHBOARD_STYLES}</style></head>${renderToStaticMarkup(h(OperatorDocumentBody, { id: "fixture-body", ...{ "data-variant": variant } }, h("main", { style: { maxWidth: 600 } }, h(WidgetTabs, { id: "source", label: "Source tabs", defaultValue: "v0", tabs, variant, compact: true }), filter, actions, h(OperatorSegmentedGroup, { id: "segmented", role: "group", "aria-label": "Segmented choices" }, h(OperatorSegmentedButton, { id: "segment-first", "aria-pressed": true }, "Pending (0)"), h(OperatorSegmentedButton, { id: "segment-long", "aria-pressed": false }, "Unbroken".repeat(40)), h(OperatorSegmentedButton, { id: "segment-attention", emphasis: "attention", "aria-pressed": true }, "Missing (0)")), form, h(OperatorDisclosure, { id: "nested-outer", presentation: "action", triggerLabel: "Unbroken".repeat(20) }, h(OperatorDisclosure, { id: "nested-inner", presentation: "action", triggerLabel: "Nested child" }, "Exact diagnostics <source>")), h(OperatorColumns, { density: "compact", primary: h("div", { id: "primary-form" }, form), aside: h("div", { id: "aside-form" }, form) }), notices, spatialViews, layoutView, h("div", { id: "action-result-probe" })), h("script", { dangerouslySetInnerHTML: { __html: DASHBOARD_UI_SCRIPT } }), h("script", { type: "module", src: "/action-result-fixture.js" })))}</html>`,
      { headers: { "content-type": "text/html" } },
    );
  },
});
try {
  for (const width of [1440, 768, 390])
    for (const climate of ["instrument", "paper"])
      for (const variant of ["line", "pill"]) {
        const executablePath = process.env["CONSOLE_CHROMIUM_PATH"];
        const page = new Bun.WebView({
          backend: {
            type: "chrome",
            ...(executablePath ? { executablePath } : {}),
          },
          width,
          height: 800,
        });
        await page.navigate(
          `http://127.0.0.1:${server.port}/?climate=${climate}&variant=${variant}`,
        );
        await page.evaluate(`(() => {
          const group=document.getElementById('segmented'),first=document.getElementById('segment-first'),long=document.getElementById('segment-long');
          if(!group||!first||!long)throw Error('Missing segmented controls');
          if(first.textContent!=='Pending (0)' || long.textContent!=='Unbroken'.repeat(40) || group.getBoundingClientRect().right>innerWidth || long.scrollWidth>long.clientWidth || (innerWidth<=640 && first.getBoundingClientRect().height<44))throw Error('Segmented labels or bounds lost');
          const selected=getComputedStyle(first).backgroundColor;
          first.setAttribute('aria-pressed','false');long.setAttribute('aria-pressed','true');
          if(getComputedStyle(long).backgroundColor!==selected || getComputedStyle(first).backgroundColor===selected)throw Error('Segmented native state does not drive paint');
          long.setAttribute('aria-pressed','false');long.setAttribute('aria-selected','true');
          if(getComputedStyle(long).backgroundColor!==selected)throw Error('Segmented tab state lost');
          group.hidden=true;if(getComputedStyle(group).display!=='none')throw Error('Segmented group ignores native hiding');group.hidden=false;
        })()`);
        const paint = await page.evaluate<{
          color: string;
          count: string;
          background: string;
        }>(`(() => {
      const pill=document.body.dataset.variant==="pill";
      const first=document.getElementById("source-tab-v0"), strip=document.querySelector('[role="tablist"]');
      if(first.textContent!==(pill?"0Complete source tab 0":"Complete source tab 00") || (!pill && strip.scrollWidth<=strip.clientWidth) || document.body.scrollWidth>innerWidth) throw Error("Counts or scroll bounds lost");
      if(innerWidth<=640 && first.getBoundingClientRect().height<44) throw Error("Phone target too small");
      first.focus(); return {color:getComputedStyle(first).color,count:getComputedStyle(first.querySelector("span")).color,background:getComputedStyle(first).backgroundColor};
    })()`);
        await page.cdp("Input.dispatchKeyEvent", {
          type: "keyDown",
          key: "ArrowRight",
          code: "ArrowRight",
        });
        await page.cdp("Input.dispatchKeyEvent", {
          type: "keyUp",
          key: "ArrowRight",
          code: "ArrowRight",
        });
        await Bun.sleep(300);
        await page.evaluate(`(() => {
      const second=document.getElementById("source-tab-v1");
      if(second.getAttribute("aria-selected")!=="true" || document.getElementById("source-panel-v1").hidden || !document.getElementById("source-panel-v0").hidden || document.activeElement!==second || getComputedStyle(second).color!==${JSON.stringify(paint.color)} || getComputedStyle(second).backgroundColor!==${JSON.stringify(paint.background)} || getComputedStyle(second.querySelector("span")).color!==${JSON.stringify(paint.count)} || getComputedStyle(second).outlineStyle!=="solid") throw Error("Selection, panels, focus, or paint lost");
    })()`);
        const box = await page.evaluate<{ x: number; y: number }>(
          `(() => {const r=document.getElementById("source-tab-v1").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`,
        );
        await page.cdp("Input.dispatchMouseEvent", {
          type: "mouseMoved",
          ...box,
        });
        await Bun.sleep(300);
        await page.evaluate(
          `(() => {if(getComputedStyle(document.getElementById("source-tab-v1")).color!==${JSON.stringify(paint.color)} || getComputedStyle(document.getElementById("source-tab-v1")).backgroundColor!==${JSON.stringify(paint.background)}) throw Error("Hover overrides selected paint");})()`,
        );
        await page.cdp("Emulation.setEmulatedMedia", {
          features: [{ name: "prefers-reduced-motion", value: "reduce" }],
        });
        await page.evaluate(
          `(() => {if(getComputedStyle(document.getElementById("source-tab-v1")).transitionDuration!=="0s") throw Error("Reduced motion failed");})()`,
        );
        await page.evaluate(`(() => {
        const root=document.querySelector('[data-ui-filter]'),controls=Array.from(root.querySelectorAll('[data-ui-filter-value]')),search=root.querySelector('input'),toggle=root.querySelector('[data-ui-filter-toggle]');
        const visible=()=>controls.filter(control=>!control.hidden);
        const checkHidden=()=>{for(const control of controls)if(control.hidden && getComputedStyle(control).display!=="none")throw Error("Hidden options are painted");};
        if(controls.length!==16 || visible().length!==13 || document.getElementById('row14').hidden || !document.getElementById('row2').hidden)throw Error("Initial source limit or rows lost");
        checkHidden();
        if(innerWidth<=640)for(const control of [...visible(),search,toggle])if(control.getBoundingClientRect().height<44)throw Error("Filter phone target too small");
        for(const control of visible())if(control.getBoundingClientRect().width>root.clientWidth+1 || control.scrollWidth>control.clientWidth+1)throw Error("Long filter label escaped its bounds");
        search.value="Choice 13";search.dispatchEvent(new Event('input',{bubbles:true}));
        if(visible().length!==3 || getComputedStyle(toggle).display!=="none")throw Error("Search lost all/active/matching options");
        checkHidden();
        root.querySelector('[data-ui-filter-value="v13"]').click();
        if(root.querySelector('[data-ui-filter-empty]').hidden || root.querySelector('[data-ui-filter-value="v13"]').getAttribute('aria-pressed')!=="true")throw Error("Empty state or filter selection lost");
        const emptyMessage=root.querySelector('[data-ui-filter-empty] p');
        if(!emptyMessage || emptyMessage.textContent!=="No source rows" || getComputedStyle(emptyMessage).fontSize!=="13px" || emptyMessage.classList.contains('muted'))throw Error("Compiled fallback copy or presentation lost");
        search.value="";search.dispatchEvent(new Event('input',{bubbles:true}));toggle.click();
        if(visible().length!==16 || toggle.getAttribute('aria-expanded')!=="true")throw Error("Show all lost source options");
        toggle.click();if(visible().length!==13 || root.querySelector('[data-ui-filter-value="v13"]').hidden)throw Error("Collapse hid the selected overflow option");
        root.querySelector('[data-ui-filter-value="all"]').click();
        if(document.getElementById('row14').hidden || document.getElementById('row2').hidden || !root.querySelector('[data-ui-filter-empty]').hidden)throw Error("All filter did not restore rows");
        checkHidden();
        const first=document.getElementById('row14'),zero=document.getElementById('row2');
        if(first.tagName!=="LI" || first.parentElement.tagName!=="UL" || first.getAttribute('data-origin-id')!=="exact:row/14" || !first.textContent.includes("2026-09-09T01:02:03Z") || !first.textContent.includes("·exact:source/identifier·0") || !first.textContent.includes("Full Tag <source>"))throw Error("List source metadata or semantics lost");
        const heading=first.querySelector('[data-summary-heading]');
        if(heading.title!=="FullSourceHeading".repeat(12) || getComputedStyle(heading).fontSize!=="16px" || getComputedStyle(heading).fontWeight!=="500")throw Error("Summary title lost its full source or standard hierarchy");
        for(const slot of ['heading','description','trailing'])if(zero.querySelector('[data-summary-'+slot+']').textContent!=="0")throw Error("Zero source values lost their semantic slots");
        for(const row of [first,zero]){if(row.scrollWidth>row.clientWidth+1)throw Error("Summary row overflows");for(const child of row.querySelectorAll('*')){const box=child.getBoundingClientRect(),bounds=row.getBoundingClientRect();if(box.width && (box.left<bounds.left-1 || box.right>bounds.right+1))throw Error("Summary metadata, tags or trailing status escaped its bounds");}}
        root.querySelector('[data-ui-filter-value="v2"]').click();
        if(getComputedStyle(first).display!=="none" || getComputedStyle(zero).display!=="grid")throw Error("Compiled list rows ignored native filter hiding");
        root.querySelector('[data-ui-filter-value="all"]').click();
      })()`);
        await page.evaluate(`(() => {
          const links=Array.from(document.querySelectorAll('[aria-label="Action links"] a'));
          if(links.length!==3 || links[0].getAttribute('href')!=="/studio?source=a%2Fb&mode=review#exact" || links[0].hasAttribute('target') || links[1].getAttribute('href')!=="https://preview.example/path?q=a%2Fb#section" || links[1].getAttribute('target')!=="_blank" || links[1].getAttribute('rel')!=="noreferrer" || links[1].querySelector('[data-action-indicator]').textContent!=="↗")throw Error("Action destinations or external semantics changed");
          for(const link of links){if(link.getBoundingClientRect().width>link.parentElement.clientWidth+1 || link.scrollWidth>link.clientWidth+1 || (innerWidth<=640 && link.getBoundingClientRect().height<44))throw Error("Action target or label bounds lost");if(link.querySelector('[data-action-indicator]').getAttribute('aria-hidden')!=="true" || getComputedStyle(link).transitionDuration!=="0s")throw Error("Action decoration or reduced motion lost");}
          links[0].scrollIntoView({block:"center"});links[0].focus();
        })()`);
        await page.cdp("Input.dispatchKeyEvent", {
          type: "keyDown",
          key: "Tab",
          code: "Tab",
        });
        await page.cdp("Input.dispatchKeyEvent", {
          type: "keyUp",
          key: "Tab",
          code: "Tab",
        });
        const actionBox = await page.evaluate<{ x: number; y: number }>(
          `(() => {const link=document.querySelectorAll('[aria-label="Action links"] a')[1];if(document.activeElement!==link || getComputedStyle(link).outlineStyle!=="solid")throw Error("Native action focus lost");link.scrollIntoView({block:"center"});const box=link.getBoundingClientRect();return {x:box.x+box.width/2,y:box.y+box.height/2};})()`,
        );
        await page.cdp("Emulation.setEmulatedMedia", {
          features: [
            { name: "prefers-reduced-motion", value: "no-preference" },
          ],
        });
        await page.cdp("Input.dispatchMouseEvent", {
          type: "mouseMoved",
          ...actionBox,
        });
        await Bun.sleep(300);
        await page.evaluate(
          `(() => {const links=document.querySelectorAll('[aria-label="Action links"] a');if(getComputedStyle(links[1]).color!==getComputedStyle(links[0]).color || getComputedStyle(links[1].querySelector('[data-action-indicator]')).transform!=="matrix(1, 0, 0, 1, 2, -1)")throw Error("Compiled action hover lost");})()`,
        );
        if (variant === "pill") {
          await page.evaluate(
            `document.getElementById("row14").scrollIntoView({block:"start"})`,
          );
          await page.cdp("Input.dispatchMouseEvent", {
            type: "mouseMoved",
            x: width - 1,
            y: 0,
          });
          await Bun.sleep(200);
          await Bun.write(
            new URL(
              `../test/visual/console/artifacts/widget-list-${width}-${climate}.png`,
              import.meta.url,
            ),
            await page.screenshot({ encoding: "buffer", format: "png" }),
          );
        }
        await page.evaluate(`document.getElementById('segment-first').focus()`);
        await page.cdp("Input.dispatchKeyEvent", {
          type: "keyDown",
          key: "Tab",
          code: "Tab",
        });
        await page.cdp("Input.dispatchKeyEvent", {
          type: "keyUp",
          key: "Tab",
          code: "Tab",
        });
        const segment = await page.evaluate<{
          x: number;
          y: number;
          color: string;
        }>(
          `(() => {const button=document.getElementById('segment-long'),css=getComputedStyle(button),r=button.getBoundingClientRect();if(document.activeElement!==button || css.outlineWidth!=='2px' || css.transitionDuration!=='0s')throw Error('Segmented keyboard focus or reduced motion lost');return {x:r.x+r.width/2,y:r.y+r.height/2,color:css.color};})()`,
        );
        await page.cdp("Input.dispatchMouseEvent", {
          type: "mouseMoved",
          x: segment.x,
          y: segment.y,
        });
        await page.evaluate(
          `(() => {if(getComputedStyle(document.getElementById('segment-long')).color!==${JSON.stringify(segment.color)})throw Error('Segmented hover overrides selected paint');})()`,
        );
        const attention = await page.evaluate<{
          x: number;
          y: number;
          color: string;
        }>(
          `(() => {const button=document.getElementById('segment-attention');button.scrollIntoView({block:'center'});const color=getComputedStyle(button).color;button.setAttribute('aria-pressed','false');if(button.textContent!=='Missing (0)' || getComputedStyle(button).color!==color || color===getComputedStyle(document.getElementById('segment-long')).color)throw Error('Attention count or emphasis lost');button.setAttribute('aria-pressed','true');const r=button.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,color};})()`,
        );
        await page.cdp("Input.dispatchMouseEvent", {
          type: "mouseMoved",
          x: attention.x,
          y: attention.y,
        });
        await page.evaluate(
          `(() => {if(getComputedStyle(document.getElementById('segment-attention')).color!==${JSON.stringify(attention.color)})throw Error('Hover overrides attention paint');})()`,
        );
        await page.evaluate(`(() => {
          const details=document.querySelector('input[name="sampleName"]').closest('details'),summary=details.querySelector(':scope > summary');
          if(details.open || getComputedStyle(summary,'::before').content!=='"+"' || summary.textContent!=='Sample form' || (innerWidth<=640 && summary.getBoundingClientRect().height<44))throw Error('Closed disclosure semantics, marker or target lost');
          summary.focus();summary.scrollIntoView({block:'center'});
        })()`);
        await page.cdp("Input.dispatchKeyEvent", {
          type: "keyDown",
          key: "Enter",
          code: "Enter",
          windowsVirtualKeyCode: 13,
          nativeVirtualKeyCode: 13,
          text: "\r",
          unmodifiedText: "\r",
        });
        await page.cdp("Input.dispatchKeyEvent", {
          type: "keyUp",
          key: "Enter",
          code: "Enter",
          windowsVirtualKeyCode: 13,
          nativeVirtualKeyCode: 13,
        });
        await page.evaluate(`(() => {
          const name=document.querySelector('input[name="sampleName"]'),total=document.querySelector('input[name="sampleTotal"]'),select=document.querySelector('select[name="sampleRole"]'),check=document.querySelector('input[name="sampleEnabled"]');
          if(!name||!total||!select||!check)throw Error('Missing native form controls');
          const details=name.closest('details'),summary=details.querySelector(':scope > summary');if(!details.open || getComputedStyle(summary,'::before').content!=='"−"' || getComputedStyle(summary).marginBottom!=='14px' || getComputedStyle(summary).outlineWidth!=='2px')throw Error('Keyboard disclosure state, marker, spacing or focus lost: '+JSON.stringify({open:details.open,marker:getComputedStyle(summary,'::before').content,margin:getComputedStyle(summary).marginBottom,outline:getComputedStyle(summary).outlineWidth}));
          for(const field of [name,total,select])if(field.getBoundingClientRect().right>innerWidth || (innerWidth<=640 && field.getBoundingClientRect().height<44) || getComputedStyle(field).fontFamily!==getComputedStyle(document.body).fontFamily)throw Error('Native form bounds, typography or target lost: '+JSON.stringify({name:field.name,rect:field.getBoundingClientRect().toJSON(),font:getComputedStyle(field).fontFamily}));
          if(!name.validity.valueMissing || total.value!=='0' || !check.checked || select.value!=='long')throw Error('Native validation or defaults lost');
          name.value='Sample';if(!name.checkValidity())throw Error('Native text validation lost');select.value='short';if(select.value!=='short')throw Error('Native option values changed');
          const label=check.closest('label');if(!label || (innerWidth<=640 && label.getBoundingClientRect().height<44) || check.getBoundingClientRect().height>=44)throw Error('Checkbox label target or native sizing lost');
          label.click();if(check.checked)throw Error('Checkbox label interaction lost');
          name.focus();
        })()`);
        await page.cdp("Input.dispatchKeyEvent", {
          type: "keyDown",
          key: "Tab",
          code: "Tab",
        });
        await page.cdp("Input.dispatchKeyEvent", {
          type: "keyUp",
          key: "Tab",
          code: "Tab",
        });
        await page.evaluate(
          `(() => {const total=document.querySelector('input[name="sampleTotal"]');if(document.activeElement!==total || getComputedStyle(total).outlineWidth!=='2px')throw Error('Native form keyboard focus lost');})()`,
        );
        await page.evaluate(`(() => {
          const outer=document.getElementById('nested-outer'),inner=document.getElementById('nested-inner'),summary=outer.querySelector(':scope > summary'),child=inner.querySelector('summary');
          if(summary.textContent!=='Unbroken'.repeat(20) || summary.scrollWidth>summary.clientWidth || summary.getBoundingClientRect().right>innerWidth)throw Error('Long disclosure trigger escaped its bounds');
          summary.click();if(!outer.open || inner.open || getComputedStyle(summary,'::before').content!=='"−"' || getComputedStyle(child,'::before').content!=='"+"')throw Error('Outer disclosure state leaked into its child');
          child.click();if(!inner.open || getComputedStyle(child,'::before').content!=='"−"')throw Error('Nested disclosure did not open');
          summary.click();summary.click();if(!inner.open || !inner.textContent.includes('Exact diagnostics <source>'))throw Error('Closing outer disclosure lost child state or content');
          const formDetails=document.querySelector('input[name="sampleName"]').closest('details');formDetails.querySelector('summary').click();formDetails.querySelector('summary').click();if(document.querySelector('input[name="sampleName"]').value!=='Sample')throw Error('Disclosure toggling discarded form edits');
        })()`);
        await page.evaluate(`(() => {
          for(const [id,columns] of [['primary-form',innerWidth<=640?1:2],['aside-form',1]]){
            const root=document.getElementById(id),details=root.querySelector('details'),form=root.querySelector('form');details.open=true;
            if(getComputedStyle(form).gridTemplateColumns.split(' ').length!==columns || form.scrollWidth>form.clientWidth)throw Error('Form region columns or bounds lost: '+id);
            const submit=form.querySelector('button[type="submit"]');if(getComputedStyle(submit).alignSelf!=='end' || getComputedStyle(submit).justifySelf!=='start')throw Error('Submit alignment lost');
          }
          const region=document.getElementById('aside-form').parentElement,form=region.querySelector('form');
          if(getComputedStyle(region).containerName!=='operator-aside')throw Error('Missing named sidebar container');
          region.classList.remove('declarative-aside');if(getComputedStyle(form).gridTemplateColumns.split(' ').length!==1)throw Error('Form still relies on the retired sidebar class');region.classList.add('declarative-aside');
        })()`);
        for (let attempt = 0; attempt < 50; attempt++) {
          if (
            await page.evaluate<boolean>(
              `Boolean(document.querySelector('#action-result-probe button'))`,
            )
          )
            break;
          await Bun.sleep(20);
        }
        await page.evaluate(
          `(() => {const button=document.querySelector('#action-result-probe button');if(!button)throw Error('Result fixture did not mount');button.click();})()`,
        );
        for (let attempt = 0; attempt < 50; attempt++) {
          if (
            await page.evaluate<boolean>(
              `Boolean(document.querySelector('#action-result-probe .declarative-action-result'))`,
            )
          )
            break;
          await Bun.sleep(20);
        }
        await page.evaluate(`(() => {
          const root=document.getElementById('action-result-probe'),panel=root.querySelector('.declarative-action-result');if(!panel)throw Error('Result panel missing');
          const rows=Array.from(panel.querySelectorAll('dl > div')),codes=rows.map(row=>row.querySelector('code').textContent),reference='reference:α—/'+'x'.repeat(512);
          if(JSON.stringify(codes)!==JSON.stringify([reference,'0','false','—']) || rows[0].dataset.sensitive!=='true' || panel.getAttribute('aria-live')!=='polite' || rows[0].querySelector('code').title!==reference)throw Error('Result projection, sensitive marker or full value lost');
          if(panel.scrollWidth>panel.clientWidth || panel.querySelector('strong').textContent!=='Exact result '+'Long'.repeat(40))throw Error('Result title lost or overflowing');
          for(const row of rows)if(row.getBoundingClientRect().right>innerWidth || row.scrollWidth>row.clientWidth)throw Error('Result row overflow');
          const value=rows[0].querySelector('code'),copy=rows[0].querySelector('button');if(value.scrollWidth<=value.clientWidth || getComputedStyle(value).textOverflow!=='ellipsis' || !copy || copy.textContent!=='Copy')throw Error('Result truncation or copy control lost');
          if(innerWidth<=640 && (copy.getBoundingClientRect().height<44 || copy.getBoundingClientRect().width<44))throw Error('Copy target too small');
          copy.click();if(root.dataset.copied!==reference)throw Error('Copy changed the full result value');
          if(innerWidth<=640){const term=rows[0].querySelector('dt'),valueRow=rows[0].querySelector('dd');if(valueRow.getBoundingClientRect().top<term.getBoundingClientRect().bottom)throw Error('Phone result facts did not stack');}
          panel.scrollIntoView({block:'center'});
        })()`);
        if (variant === "pill")
          await Bun.write(
            new URL(
              `../test/visual/console/artifacts/widget-result-${width}-${climate}.png`,
              import.meta.url,
            ),
            await page.screenshot({ encoding: "buffer", format: "png" }),
          );
        await page.evaluate(`(() => {
          const root=document.getElementById('action-result-probe'),disabled=root.querySelector('button:disabled'),trigger=Array.from(root.querySelectorAll('button')).find(button=>button.textContent==='Confirm fixture');
          if(!disabled||!trigger || disabled.textContent!=='Unbroken'.repeat(20) || disabled.scrollWidth>disabled.clientWidth || disabled.getBoundingClientRect().right>innerWidth || getComputedStyle(disabled).opacity!=='0.5' || (innerWidth<=640 && disabled.getBoundingClientRect().height<44))throw Error('Compiled disabled action lost content, bounds or target');
          if(Array.from(root.querySelectorAll('button')).some(button=>button.classList.contains('btn')))throw Error('Retired button classes remain');
          disabled.click();if(root.dataset.invocations!=='1')throw Error('Disabled action invoked');root.style.containerType='inline-size';root.style.containerName='operator-aside';trigger.click();
        })()`);
        await Bun.sleep(50);
        await page.evaluate(
          `(() => {const dialog=document.querySelector('[role="alertdialog"]'),cancel=dialog?.querySelector('button');if(!dialog || !cancel || document.activeElement!==cancel)throw Error('Confirmation autofocus lost');if(dialog.closest('#action-result-probe')||getComputedStyle(dialog).position!=='fixed'||dialog.getBoundingClientRect().right>innerWidth)throw Error('Confirmation is not a viewport portal');})()`,
        );
        await page.cdp("Input.dispatchKeyEvent", {
          type: "keyDown",
          key: "Tab",
          code: "Tab",
        });
        await page.cdp("Input.dispatchKeyEvent", {
          type: "keyUp",
          key: "Tab",
          code: "Tab",
        });
        const primary = await page.evaluate<{ x: number; y: number }>(
          `(() => {const dialog=document.querySelector('[role="alertdialog"]'),button=Array.from(dialog.querySelectorAll('button')).find(button=>button.textContent==='Confirm action');if(!button || document.activeElement!==button || getComputedStyle(button).boxShadow==='none' || button.classList.contains('btn') || (innerWidth<=640 && button.getBoundingClientRect().height<44))throw Error('Compiled confirmation focus or target lost');button.scrollIntoView({block:'center'});const r=button.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`,
        );
        await page.cdp("Emulation.setEmulatedMedia", {
          features: [{ name: "prefers-reduced-motion", value: "reduce" }],
        });
        await page.cdp("Input.dispatchMouseEvent", {
          type: "mouseMoved",
          ...primary,
        });
        await page.evaluate(
          `(() => {const button=document.activeElement,style=getComputedStyle(button);if(style.transitionDuration!=='0s' || style.transform!=='none')throw Error('Reduced motion primary action still moves: '+JSON.stringify({transition:style.transitionDuration,transform:style.transform}));})()`,
        );
        await page.cdp("Emulation.setEmulatedMedia", {
          features: [
            { name: "prefers-reduced-motion", value: "no-preference" },
          ],
        });
        await Bun.sleep(180);
        await page.evaluate(
          `(() => {if(getComputedStyle(document.activeElement).transform==='none')throw Error('Normal primary hover lost');})()`,
        );
        await page.cdp("Emulation.setEmulatedMedia", {
          features: [{ name: "prefers-reduced-motion", value: "reduce" }],
        });
        await page.evaluate(
          `(() => {if(getComputedStyle(document.activeElement).transform!=='none')throw Error('Reduced motion did not stop hover translation');})()`,
        );
        await page.cdp("Input.dispatchKeyEvent", {
          type: "keyDown",
          key: "Escape",
          code: "Escape",
        });
        await page.cdp("Input.dispatchKeyEvent", {
          type: "keyUp",
          key: "Escape",
          code: "Escape",
        });
        await Bun.sleep(30);
        await page.evaluate(
          `(() => {const root=document.getElementById('action-result-probe');if(document.querySelector('[role="alertdialog"]') || root.dataset.invocations!=='1')throw Error('Cancel executed the consequential action');root.style.removeProperty('container-type');root.style.removeProperty('container-name');})()`,
        );
        await page.evaluate(
          `(() => {Array.from(document.querySelectorAll('#action-result-probe button')).find(button=>button.textContent==='Confirm fixture').click();})()`,
        );
        await Bun.sleep(50);
        await page.evaluate(
          `(() => {const dialog=document.querySelector('[role="alertdialog"]'),overlay=dialog?.previousElementSibling;if(!overlay||getComputedStyle(overlay).position!=='fixed')throw Error('Missing confirmation overlay');overlay.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));})()`,
        );
        await Bun.sleep(50);
        await page.evaluate(
          `(() => {if(document.querySelector('[role="alertdialog"]')||document.getElementById('action-result-probe').dataset.invocations!=='1')throw Error('Outside dismissal changed confirmation policy');})()`,
        );
        await page.evaluate(`(() => {
          const root=document.getElementById('action-result-probe'),tables=Array.from(root.querySelectorAll('table'));if(tables.length!==3)throw Error('Table fixtures missing');
          const [mixed,annotated,plain]=tables,scroll=mixed.parentElement,rows=Array.from(mixed.tBodies[0].rows),compact=scroll.previousElementSibling;
          if(rows[0].cells[1].textContent!=='0' || getComputedStyle(rows[0].cells[1]).textAlign!=='center' || getComputedStyle(rows[0].cells[2]).textAlign!=='right')throw Error('Table cell values or alignment lost');
          if(scroll.scrollWidth<=scroll.clientWidth || scroll.getBoundingClientRect().right>innerWidth || getComputedStyle(scroll).overflowX!=='auto')throw Error('Wide table does not scroll within bounds');
          if(innerWidth<=640){if(getComputedStyle(compact).display==='none' || getComputedStyle(rows[0]).display!=='none' || getComputedStyle(rows[1]).display==='none' || getComputedStyle(annotated.parentElement).display!=='none' || getComputedStyle(plain.parentElement).display==='none')throw Error('Compact eligibility or unannotated rows lost');}
          else if(getComputedStyle(compact).display!=='none' || getComputedStyle(rows[0]).display==='none' || getComputedStyle(annotated.parentElement).display==='none')throw Error('Desktop table rows lost');
          const row=rows[1],cells=Array.from(row.cells),actionCell=cells.at(-1),actions=actionCell.querySelector('.declarative-actions');
          if(getComputedStyle(cells[0]).fontSize!=='14px' || getComputedStyle(cells[1]).fontSize!=='13px' || getComputedStyle(actions).justifyContent!=='flex-end' || getComputedStyle(actionCell).paddingRight!=='0px')throw Error('Table hierarchy or action alignment lost');
          row.setAttribute('aria-current','true');if(getComputedStyle(row).boxShadow==='none')throw Error('Native current-row paint lost');
          const copy=row.cells[2].textContent;if(copy!=='reference:α—/'+'x'.repeat(512))throw Error('Table diagnostic truncated');
          const action=actions.querySelector('button');action.click();if(root.dataset.lastInput!==JSON.stringify({id:'plain'}) || root.dataset.invocations!=='2')throw Error('Table action lost exact input');
          scroll.scrollIntoView({block:'center'});
        })()`);
        if (variant === "pill")
          await Bun.write(
            new URL(
              `../test/visual/console/artifacts/widget-table-${width}-${climate}.png`,
              import.meta.url,
            ),
            await page.screenshot({ encoding: "buffer", format: "png" }),
          );
        await page.evaluate(`(() => {
          const root=document.getElementById('action-result-probe'),bar=root.querySelector('progress[aria-label="Progress fixture"]'),frame=bar.parentElement,meters=root.querySelector('[data-block="meters"] dl'),card=root.querySelector('[data-operator-card-body] dl');
          if(bar.getAttribute('value')!=='0'||bar.max!==1||getComputedStyle(bar).height!=='4px'||getComputedStyle(bar).appearance!=='none')throw Error('Native progress or compiled bar lost');
          if(frame.querySelector('small').textContent!=='Started 2026-09-09T12:34:56Z · Updated 2026-09-09T12:35:00Z'||frame.querySelector('p').textContent!=='reference:α—/'+'x'.repeat(512))throw Error('Progress source text changed');
          if(meters.querySelector('dd span').textContent!=='0 items'||meters.querySelectorAll('progress').length!==1)throw Error('Zero, unit or absent maximum changed');
          if(getComputedStyle(card).gridTemplateColumns.split(' ').length!==2||getComputedStyle(card).gap!=='12px')throw Error('Card meter layout lost');
          for(const element of [frame,meters,card])if(element.scrollWidth>element.clientWidth+1||element.getBoundingClientRect().right>innerWidth)throw Error('Progress layout overflow');
          frame.scrollIntoView({block:'center'});
        })()`);
        if (variant === "pill")
          await Bun.write(
            new URL(
              `../test/visual/console/artifacts/widget-progress-${width}-${climate}.png`,
              import.meta.url,
            ),
            await page.screenshot({ encoding: "buffer", format: "png" }),
          );
        await page.evaluate(`(() => {
          const heading=document.getElementById('flow-probe-title'),track=heading.nextElementSibling,steps=Array.from(track.children),cardHeading=document.getElementById('card-flow-probe-title');
          if(track.dataset.direction!=='bidirectional'||steps.map(step=>step.dataset.status).join(',')!=='idle,active,complete,failed')throw Error('Flow source order, status or direction lost');
          if(steps[1].querySelector('strong').textContent!=='Long'.repeat(30)||steps[1].querySelector('small').textContent!=='reference:α—/'+'x'.repeat(512))throw Error('Flow source text changed');
          if(getComputedStyle(track).overflowX!==(innerWidth<=640?'visible':'auto')||track.getBoundingClientRect().right>innerWidth||steps.some(step=>step.scrollWidth>step.clientWidth+1))throw Error('Flow scroll or station bounds lost');
          if(innerWidth<=640&&(getComputedStyle(track).display!=='grid'||steps[1].getBoundingClientRect().top<=steps[0].getBoundingClientRect().bottom||getComputedStyle(steps[0],'::after').width!=='1px'))throw Error('Vertical phone flow lost');
          if(innerWidth>640){track.style.maxWidth='240px';if(track.scrollWidth<=track.clientWidth)throw Error('Narrow flow cannot scroll');track.scrollLeft=100;if(track.scrollLeft===0)throw Error('Flow scroll position cannot change');track.scrollLeft=0;track.style.removeProperty('max-width');}
          for(const step of steps)if(getComputedStyle(step.querySelector('span')).width!=='9px')throw Error('Station mark size lost');
          if(getComputedStyle(steps[1].querySelector('span')).boxShadow==='none'||(innerWidth>640&&getComputedStyle(steps[0],'::after').height!=='1px')||getComputedStyle(steps[3],'::after').content!=='none')throw Error('Station halo or connecting lines lost');
          if(getComputedStyle(cardHeading).display!=='none'||getComputedStyle(heading).display==='none')throw Error('Card caption scope lost');
          track.style.setProperty('--console-err','rgb(176, 0, 32)');if(getComputedStyle(steps[3].querySelector('strong')).color!=='rgb(176, 0, 32)'||getComputedStyle(steps[3].querySelector('span')).backgroundColor!=='rgb(176, 0, 32)')throw Error('Failed flow paint lost');
          steps[0].dataset.status='failed';if(getComputedStyle(steps[0].querySelector('span')).backgroundColor!=='rgb(176, 0, 32)'||getComputedStyle(steps[0].querySelector('strong')).color!=='rgb(176, 0, 32)')throw Error('Flow status mutation lost');
          steps[0].dataset.status='active';if(getComputedStyle(steps[0].querySelector('span')).boxShadow==='none')throw Error('Active flow mutation lost');steps[0].dataset.status='idle';track.style.removeProperty('--console-err');
          heading.style.setProperty('--operator-section-transform','none');if(getComputedStyle(heading).textTransform!=='none')throw Error('Host caption slot lost');heading.style.removeProperty('--operator-section-transform');
          heading.scrollIntoView({block:'start'});
        })()`);
        if (variant === "pill")
          await Bun.write(
            new URL(
              `../test/visual/console/artifacts/widget-flow-${width}-${climate}.png`,
              import.meta.url,
            ),
            await page.screenshot({ encoding: "buffer", format: "png" }),
          );
        await page.evaluate(`(() => {
          const fixtures=document.getElementById('notice-fixtures'),notices=Array.from(fixtures.querySelectorAll('aside'));if(notices.length!==8)throw Error('Notice fixtures missing');
          for(const notice of notices){const compact=notice.parentElement.dataset.noticeDensity==='compact',css=getComputedStyle(notice),p=notice.querySelector('p'),title=notice.querySelector('strong'),link=notice.querySelector('a');
            if(css.borderTopWidth!=='0px'||css.borderRightWidth!=='0px'||css.borderBottomWidth!=='0px'||css.borderLeftWidth!=='2px'||css.borderRadius!=='0px'||notice.classList.contains('operator-notice'))throw Error('Retired notice frame leaked');
            if(title.textContent!=='Notice <required>'||p.textContent!=='Exact notice <source> α—/\\n\\n'+'LongNotice'.repeat(25)||getComputedStyle(p).whiteSpace!=='pre-line'||getComputedStyle(p).marginTop!=='9px')throw Error('Notice source text or spacing changed');
            if(getComputedStyle(title).fontSize!==(compact?'13px':'18px')||getComputedStyle(p).fontSize!==(compact?'12.5px':'12px'))throw Error('Notice density changed');
            if(css.paddingLeft!==(compact||innerWidth<=640?'14px':'20px')||css.paddingRight!==(compact?'14px':'0px'))throw Error('Notice density gutters lost');
            if(link.getAttribute('href')!=='/studio?pane=exact%2Fnotice#review'||notice.scrollWidth>notice.clientWidth+1||notice.getBoundingClientRect().right>innerWidth)throw Error('Notice action or bounds lost');
            const token={neutral:'--console-text-muted',good:'--console-ok',warn:'--console-warn',error:'--console-err'}[notice.dataset.tone];notice.style.setProperty(token,'rgb(12, 34, 56)');if(getComputedStyle(notice).borderLeftColor!=='rgb(12, 34, 56)')throw Error('Notice tone lost');notice.style.removeProperty(token);
          }
          const runtime=document.querySelector('#action-result-probe [data-block="notice"]'),details=runtime.querySelector('details'),summary=details.querySelector('summary');if(details.open||summary.textContent!=='View diagnostics')throw Error('Notice disclosure default changed');summary.click();
          if(!details.open||runtime.querySelector('pre').textContent!=='reference:α—/'+'x'.repeat(512)+'\\n\\nSecond exact diagnostic <source>')throw Error('Notice diagnostics changed');summary.click();if(details.open)throw Error('Notice disclosure cannot close');
          fixtures.scrollIntoView({block:'start'});
        })()`);
        if (variant === "pill")
          await Bun.write(
            new URL(
              `../test/visual/console/artifacts/widget-notice-${width}-${climate}.png`,
              import.meta.url,
            ),
            await page.screenshot({ encoding: "buffer", format: "png" }),
          );
        await page.evaluate(`(() => {
          const fixtures=document.getElementById('spatial-fixtures'),figures=Array.from(fixtures.querySelectorAll('figure'));if(figures.length!==2)throw Error('Spatial fixtures missing');
          for(const figure of figures){const svg=figure.querySelector('svg'),canvas=svg.parentElement,overlay=canvas.querySelector('[role="list"]');
            if(svg.getAttribute('viewBox')!=='0 0 1000 600'||svg.getAttribute('preserveAspectRatio')!=='none'||getComputedStyle(svg).position!=='absolute'||getComputedStyle(overlay).position!=='absolute')throw Error('Spatial coordinate frame changed');
            if(Math.abs(parseFloat(getComputedStyle(canvas).minHeight)-Math.max(280,Math.min(480,innerWidth*.42)))>.1||getComputedStyle(canvas).overflow!=='hidden'||figure.getBoundingClientRect().right>innerWidth||figure.scrollWidth>figure.clientWidth+1)throw Error('Spatial canvas bounds lost');
            if(Math.abs(svg.getBoundingClientRect().width-canvas.clientWidth)>1||Math.abs(overlay.getBoundingClientRect().height-canvas.clientHeight)>1)throw Error('Spatial overlay no longer fills canvas');
            const line=svg.querySelector('line');if(svg.querySelectorAll('line').length!==1||parseFloat(getComputedStyle(line).strokeWidth)!==1||getComputedStyle(line).vectorEffect!=='non-scaling-stroke')throw Error('Relationship admission or stroke changed');
            svg.style.setProperty('--console-ok','rgb(1, 2, 3)');svg.style.setProperty('--console-warn','rgb(4, 5, 6)');svg.style.setProperty('--console-rule-strong','rgb(7, 8, 9)');const tone=line.dataset.tone;
            for(const [value,color] of [['good','rgb(1, 2, 3)'],['warn','rgb(4, 5, 6)'],['error','rgb(7, 8, 9)']]){line.dataset.tone=value;if(getComputedStyle(line).stroke!==color)throw Error('Relationship tone precedence changed');}line.dataset.tone=tone;for(const token of ['--console-ok','--console-warn','--console-rule-strong'])svg.style.removeProperty(token);
          }
          const [cartesian,radial]=figures,circle=cartesian.querySelector('circle'),cartLine=cartesian.querySelector('line');
          if(circle.getAttribute('cx')!=='500'||circle.getAttribute('cy')!=='300'||circle.getAttribute('r')!=='72'||parseFloat(getComputedStyle(circle).strokeWidth)!==1.5||getComputedStyle(circle).strokeDasharray!=='4px, 6px'||cartLine.getAttribute('x1')!=='250'||cartLine.getAttribute('y2')!=='150')throw Error('Cartesian geometry changed');
          const rings=Array.from(radial.querySelectorAll('ellipse')),center=radial.querySelector('[data-kind="identity"]'),radialLine=radial.querySelector('line');
          if(JSON.stringify(rings.map(ring=>[ring.getAttribute('rx'),ring.getAttribute('ry')]))!==JSON.stringify([['225','135'],['450','270']])||radialLine.getAttribute('y1')!=='30'||radialLine.getAttribute('x2')!=='725'||center.textContent!=='Centerα'.repeat(15)||center.scrollWidth>center.clientWidth+1)throw Error('Radial geometry or center text changed');
          const north=radial.querySelector('[data-ui-spatial-point="north"]'),east=radial.querySelector('[data-ui-spatial-point="east"]'),south=radial.querySelector('[data-ui-spatial-point="south"]');north.click();south.getAnimations().forEach(animation=>animation.finish());
          if(north.getAttribute('aria-pressed')!=='true'||!east.hasAttribute('data-ui-spatial-related-active')||getComputedStyle(south).opacity!=='0.3'||document.getElementById('radial-probe-detail-north').hidden||cartesian.hasAttribute('data-ui-spatial-active'))throw Error('Spatial selection routing changed');
          east.focus();if(east.getAttribute('aria-pressed')!=='true'||!north.hasAttribute('data-ui-spatial-related-active'))throw Error('Spatial focus/reverse relationship changed');east.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
          if(radial.hasAttribute('data-ui-spatial-active')||Array.from(radial.querySelectorAll('[data-ui-spatial-detail]')).some(detail=>!detail.hidden))throw Error('Spatial Escape clearing changed');east.blur();fixtures.scrollIntoView({block:'start'});
        })()`);
        if (variant === "pill")
          await Bun.write(
            new URL(
              `../test/visual/console/artifacts/widget-spatial-${width}-${climate}.png`,
              import.meta.url,
            ),
            await page.screenshot({ encoding: "buffer", format: "png" }),
          );
        await page.evaluate(`(() => {
          const fixture=document.getElementById('renderer-layout-fixture'),heading=fixture.querySelector('main > header'),grid=fixture.querySelector('[data-block="matrix"] > div'),links=fixture.querySelector('nav'),empty=fixture.querySelector('[data-block="list"] p');
          if(heading.querySelector('h2').textContent!=='Authored heading'||heading.querySelector('strong').textContent!=='Queued (0)Exact status detail'||getComputedStyle(heading.querySelector('h2')).fontSize!==(innerWidth<=900?'27px':'34px'))throw Error('Compiled renderer head lost source/hierarchy');
          if(getComputedStyle(grid).gridTemplateColumns.split(' ').length!==(innerWidth<=720?1:3)||grid.children.length!==3)throw Error('Source matrix columns or phone stacking lost');
          for(const cell of grid.children)if(cell.scrollWidth>cell.clientWidth+1||cell.getBoundingClientRect().right>innerWidth||getComputedStyle(cell.querySelector('h3')).overflowWrap!=='anywhere')throw Error('Matrix text overflow');
          if(getComputedStyle(links).gap!=='18px'||links.querySelector('a').getAttribute('href')!=='https://example.com/exact?q=a%2Fb#review'||empty.textContent!=='Exact empty collection'||getComputedStyle(empty).paddingTop!=='18px')throw Error('Links or empty-state contract lost');
          fixture.scrollIntoView({block:'start'});
        })()`);
        if (variant === "pill")
          await Bun.write(
            new URL(
              `../test/visual/console/artifacts/widget-renderer-${width}-${climate}.png`,
              import.meta.url,
            ),
            await page.screenshot({ encoding: "buffer", format: "png" }),
          );
        page.close();
        console.log(
          `${width}px ${climate} ${variant}: tabs, filters, actions, lists, native state, focus, bounds, hover and reduced motion pass`,
        );
      }
} finally {
  Bun.WebView.closeAll();
  await server.stop(true);
}
