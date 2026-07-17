import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window, type Element as HappyDOMElement } from "happy-dom";
import { DASHBOARD_UI_SCRIPT } from "../src/render/ui-script";

let window: Window;

function element(selector: string): HappyDOMElement {
  const match = window.document.querySelector(selector);
  if (!match) throw new Error(`Missing test element: ${selector}`);
  return match;
}

function focus(selector: string): void {
  (element(selector) as unknown as { focus: () => void }).focus();
}

function click(selector: string): void {
  element(selector).dispatchEvent(
    new window.MouseEvent("click", { bubbles: true, cancelable: true }),
  );
}

function keydown(selector: string, key: string): void {
  element(selector).dispatchEvent(
    new window.KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
    }),
  );
}

function runScript(): void {
  eval(DASHBOARD_UI_SCRIPT);
}

beforeEach(() => {
  window = new Window({ url: "http://brain.test/dashboard" });
  Object.assign(globalThis, {
    window,
    document: window.document,
  });
});

afterEach(() => {
  window.close();
  delete (globalThis as Record<string, unknown>)["window"];
  delete (globalThis as Record<string, unknown>)["document"];
});

describe("dashboard tab behavior", () => {
  it("activates the default tab and synchronizes panels and ARIA state", () => {
    window.document.body.innerHTML = `
      <div data-ui-tabs data-ui-tabs-default="first">
        <div role="tablist">
          <button data-ui-tab="first" role="tab">First</button>
          <button data-ui-tab="second" role="tab">Second</button>
        </div>
        <section data-ui-panel="first">First panel</section>
        <section data-ui-panel="second">Second panel</section>
      </div>`;

    runScript();

    expect(element("[data-ui-tabs]").getAttribute("data-ui-tabs-active")).toBe(
      "first",
    );
    expect(
      element('[data-ui-tab="first"]').classList.contains("is-active"),
    ).toBe(true);
    expect(element('[data-ui-tab="first"]').getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(element('[data-ui-tab="first"]').getAttribute("tabindex")).toBe("0");
    expect(
      element('[data-ui-tab="second"]').getAttribute("aria-selected"),
    ).toBe("false");
    expect(element('[data-ui-tab="second"]').getAttribute("tabindex")).toBe(
      "-1",
    );
    expect(element('[data-ui-panel="first"]').hasAttribute("hidden")).toBe(
      false,
    );
    expect(element('[data-ui-panel="second"]').hasAttribute("hidden")).toBe(
      true,
    );
  });

  it("uses valid hashes, updates history on activation, and falls back for unknown hashes", () => {
    window.history.replaceState(null, "", "#system");
    window.document.body.innerHTML = `
      <div data-ui-tabs data-ui-tabs-hash data-ui-tabs-default="overview">
        <div role="tablist">
          <a href="#overview" data-ui-tab="overview" role="tab">Overview</a>
          <a href="#system" data-ui-tab="system" role="tab">System</a>
        </div>
        <section data-ui-panel="overview">Overview panel</section>
        <section data-ui-panel="system">System panel</section>
      </div>`;

    runScript();
    expect(element("[data-ui-tabs]").getAttribute("data-ui-tabs-active")).toBe(
      "system",
    );

    click('[data-ui-tab="overview"]');
    expect(window.location.hash).toBe("#overview");
    expect(element("[data-ui-tabs]").getAttribute("data-ui-tabs-active")).toBe(
      "overview",
    );

    window.history.replaceState(null, "", "#unknown");
    window.dispatchEvent(new window.HashChangeEvent("hashchange"));
    expect(element("[data-ui-tabs]").getAttribute("data-ui-tabs-active")).toBe(
      "overview",
    );
  });

  it("keeps nested tab roots isolated from their parent", () => {
    window.document.body.innerHTML = `
      <div id="outer" data-ui-tabs data-ui-tabs-default="outer-a">
        <div role="tablist">
          <button data-ui-tab="outer-a" role="tab">Outer A</button>
          <button data-ui-tab="outer-b" role="tab">Outer B</button>
        </div>
        <section data-ui-panel="outer-a">
          <div id="inner" data-ui-tabs data-ui-tabs-default="inner-a" data-ui-tabs-state-attribute="data-view">
            <div role="tablist">
              <button data-ui-tab="inner-a" role="tab">Inner A</button>
              <button data-ui-tab="inner-b" role="tab">Inner B</button>
            </div>
            <div data-ui-panel="inner-a">Inner A panel</div>
            <div data-ui-panel="inner-b">Inner B panel</div>
          </div>
        </section>
        <section data-ui-panel="outer-b">Outer B panel</section>
      </div>`;

    runScript();
    click('#inner [data-ui-tab="inner-b"]');

    expect(element("#inner").getAttribute("data-ui-tabs-active")).toBe(
      "inner-b",
    );
    expect(element("#inner").getAttribute("data-view")).toBe("inner-b");
    expect(element("#outer").getAttribute("data-ui-tabs-active")).toBe(
      "outer-a",
    );
    expect(element('[data-ui-panel="outer-b"]').hasAttribute("hidden")).toBe(
      true,
    );
  });

  it("supports Arrow, Home, and End keyboard navigation with roving focus", () => {
    window.document.body.innerHTML = `
      <div data-ui-tabs data-ui-tabs-default="one">
        <div role="tablist">
          <button data-ui-tab="one" role="tab">One</button>
          <button data-ui-tab="two" role="tab">Two</button>
          <button data-ui-tab="three" role="tab">Three</button>
        </div>
        <div data-ui-panel="one">One panel</div>
        <div data-ui-panel="two">Two panel</div>
        <div data-ui-panel="three">Three panel</div>
      </div>`;

    runScript();
    focus('[data-ui-tab="one"]');

    keydown('[data-ui-tab="one"]', "ArrowLeft");
    expect(
      window.document.activeElement === element('[data-ui-tab="three"]'),
    ).toBe(true);
    expect(element("[data-ui-tabs]").getAttribute("data-ui-tabs-active")).toBe(
      "three",
    );

    keydown('[data-ui-tab="three"]', "Home");
    expect(
      window.document.activeElement === element('[data-ui-tab="one"]'),
    ).toBe(true);

    keydown('[data-ui-tab="one"]', "End");
    expect(
      window.document.activeElement === element('[data-ui-tab="three"]'),
    ).toBe(true);
    expect(element('[data-ui-tab="three"]').getAttribute("tabindex")).toBe("0");
    expect(element('[data-ui-tab="one"]').getAttribute("tabindex")).toBe("-1");
  });

  it("ignores roots without a usable tab and panel set", () => {
    window.document.body.innerHTML = `
      <div id="empty" data-ui-tabs data-ui-tabs-default="missing"></div>
      <div id="tabs-only" data-ui-tabs><button data-ui-tab="one">One</button></div>`;

    expect(runScript).not.toThrow();
    expect(element("#empty").hasAttribute("data-ui-tabs-active")).toBe(false);
    expect(element("#tabs-only").hasAttribute("data-ui-tabs-active")).toBe(
      false,
    );
  });
});

describe("dashboard filter behavior", () => {
  it("filters multi-value rows, updates controls, and reveals an empty state", () => {
    window.document.body.innerHTML = `
      <div data-ui-filter data-ui-filter-default="all" data-ui-filter-all="all">
        <button data-ui-filter-value="all">All</button>
        <button data-ui-filter-value="research">Research</button>
        <button data-ui-filter-value="missing">Missing</button>
        <ul>
          <li id="research" data-ui-filter-values='["research","writing"]'>Research</li>
          <li id="operations" data-ui-filter-values='["operations"]'>Operations</li>
        </ul>
        <p data-ui-filter-empty hidden>No matches.</p>
      </div>`;

    runScript();
    expect(
      element("[data-ui-filter]").getAttribute("data-ui-filter-active"),
    ).toBe("all");
    expect(
      element('[data-ui-filter-value="all"]').getAttribute("aria-pressed"),
    ).toBe("true");

    click('[data-ui-filter-value="research"]');
    expect(element("#research").hasAttribute("hidden")).toBe(false);
    expect(element("#operations").hasAttribute("hidden")).toBe(true);
    expect(element("[data-ui-filter-empty]").hasAttribute("hidden")).toBe(true);

    click('[data-ui-filter-value="missing"]');
    expect(element("#research").hasAttribute("hidden")).toBe(true);
    expect(element("#operations").hasAttribute("hidden")).toBe(true);
    expect(element("[data-ui-filter-empty]").hasAttribute("hidden")).toBe(
      false,
    );
    expect(
      element('[data-ui-filter-value="missing"]').getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("keeps nested filters isolated and treats malformed row values as empty", () => {
    window.document.body.innerHTML = `
      <div id="outer-filter" data-ui-filter data-ui-filter-default="all">
        <button data-ui-filter-value="all">All</button>
        <button data-ui-filter-value="research">Research</button>
        <div id="outer-row" data-ui-filter-values='["research","writing"]'>
          <div id="inner-filter" data-ui-filter data-ui-filter-default="all">
            <button data-ui-filter-value="all">All</button>
            <button data-ui-filter-value="beta">Beta</button>
            <span id="inner-alpha" data-ui-filter-values='["alpha"]'>Alpha</span>
            <span id="inner-beta" data-ui-filter-values='["beta"]'>Beta</span>
          </div>
        </div>
        <div id="malformed" data-ui-filter-values="not-json">Malformed</div>
      </div>`;

    runScript();
    click('#outer-filter > [data-ui-filter-value="research"]');
    click('#inner-filter [data-ui-filter-value="beta"]');

    expect(element("#outer-filter").getAttribute("data-ui-filter-active")).toBe(
      "research",
    );
    expect(element("#inner-filter").getAttribute("data-ui-filter-active")).toBe(
      "beta",
    );
    expect(element("#outer-row").hasAttribute("hidden")).toBe(false);
    expect(element("#malformed").hasAttribute("hidden")).toBe(true);
    expect(element("#inner-alpha").hasAttribute("hidden")).toBe(true);
    expect(element("#inner-beta").hasAttribute("hidden")).toBe(false);
  });
});
