import { type VisualCase, saveArtifactScreenshot } from "./capture";
import {
  verifyDashboardChrome,
  verifyDashboardSummary,
  verifyMapMotion,
} from "./dashboard-checks";
import {
  clickSelector,
  evaluatePage,
  evaluatePageWith,
  navigateToNetworkIdle,
} from "./page";

/**
 * Verifies the Dashboard chrome and Overview, keeps System evidence for the
 * default surface, and opens the tab a section surface captures.
 */
export async function exerciseDashboard({
  page,
  surface,
  viewport,
  climate,
}: VisualCase): Promise<void> {
  await verifyDashboardChrome(page);
  await verifyDashboardSummary(page);
  if (surface === "dashboard") {
    const previousHash = await evaluatePage(page, () => window.location.hash);
    await clickSelector(page, '[data-dashboard-tab-link="system"]');
    await evaluatePage(page, async () => {
      await document.fonts.ready;
      window.scrollTo(0, 0);
    });
    await saveArtifactScreenshot(
      page,
      `dashboard-system-${viewport.width}x${viewport.height}-${climate}.png`,
    );
    if (viewport.width <= 700) {
      await evaluatePage(page, () =>
        document
          .querySelector(".system-checks-card")
          ?.scrollIntoView({ block: "start" }),
      );
      await saveArtifactScreenshot(
        page,
        `dashboard-system-checks-${viewport.width}x${viewport.height}-${climate}.png`,
      );
    }
    if (viewport.width <= 960) {
      await evaluatePage(page, () =>
        document
          .querySelector(".system-runtime-card")
          ?.scrollIntoView({ block: "start" }),
      );
      await saveArtifactScreenshot(
        page,
        `dashboard-system-reference-${viewport.width}x${viewport.height}-${climate}.png`,
      );
    }
    await clickSelector(page, '[data-dashboard-tab-link="overview"]');
    await evaluatePageWith(
      page,
      (hash) => {
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search + hash,
        );
        window.scrollTo(0, 0);
      },
      previousHash,
    );
  }
  if (surface === "dashboard-knowledge" || surface === "dashboard-network") {
    const tab = surface === "dashboard-knowledge" ? "knowledge" : "network";
    await clickSelector(page, `[data-dashboard-tab-link="${tab}"]`);
    await evaluatePage(page, () => window.scrollTo(0, 0));
  }
}

/**
 * Re-renders the Dashboard from its degraded fixtures once the default
 * capture is recorded: a waiting brain, empty maps, a declarative network,
 * and a dense atlas.
 */
export async function verifyDashboardFixtureStates(
  visualCase: VisualCase,
): Promise<void> {
  await verifyWaitingSystem(visualCase);
  await verifyEmptyMaps(visualCase);
  await verifyDeclarativeNetwork(visualCase);
  await verifyDenseAtlas(visualCase);
}

async function verifyWaitingSystem({
  page,
  viewport,
  climate,
  origin,
}: VisualCase): Promise<void> {
  await navigateToNetworkIdle(
    page,
    `${origin}/dashboard?climate=${climate}&fixture-state=waiting#system`,
  );
  await evaluatePage(page, async () => {
    await document.fonts.ready;
    const panel = document.getElementById("system");
    if (
      !panel ||
      panel.hidden ||
      !panel.querySelector('[data-status-summary="warn"]') ||
      !panel.querySelector('[data-readiness-tone="neutral"]') ||
      panel.querySelectorAll('tbody tr[data-tone="warn"]').length !== 2
    )
      throw new Error(
        "Production System rendering lost degraded/waiting states",
      );
    if (
      !panel.textContent.includes(
        "One or more advertised public surfaces are unavailable.",
      )
    )
      throw new Error("Missing public outage diagnostic");
    window.scrollTo(0, 0);
  });
  await saveArtifactScreenshot(
    page,
    `dashboard-system-waiting-${viewport.width}x${viewport.height}-${climate}.png`,
  );
}

async function verifyEmptyMaps({
  page,
  viewport,
  climate,
}: VisualCase): Promise<void> {
  for (const tab of ["knowledge", "network"] as const) {
    await clickSelector(page, `[data-dashboard-tab-link="${tab}"]`);
    await evaluatePageWith(
      page,
      (section) => {
        const panel = document.getElementById(section);
        const frame = panel?.querySelector<HTMLElement>(".map-field");
        const empty = frame?.querySelector(".map-empty");
        if (
          !panel ||
          panel.hidden ||
          !frame ||
          !empty ||
          panel.querySelector("svg") ||
          Math.abs(empty.getBoundingClientRect().width - frame.clientWidth) >
            1 ||
          getComputedStyle(empty).minHeight !==
            (window.innerWidth <= 700 ? "260px" : "360px")
        )
          throw new Error("Empty map lost its full-width reading state");
        window.scrollTo(0, 0);
      },
      tab,
    );
    await saveArtifactScreenshot(
      page,
      `dashboard-${tab}-empty-${viewport.width}x${viewport.height}-${climate}.png`,
    );
  }
}

async function verifyDeclarativeNetwork({
  page,
  viewport,
  climate,
  origin,
}: VisualCase): Promise<void> {
  await navigateToNetworkIdle(
    page,
    `${origin}/dashboard?climate=${climate}&fixture-state=declarative-network#network`,
  );
  await evaluatePage(page, async () => {
    await document.fonts.ready;
    const frame = document.querySelector<HTMLElement>(".proximity-map-field");
    const graphic = frame?.querySelector("svg");
    if (!frame || !graphic)
      throw new Error("Missing declarative network frame");
    if (
      graphic.getAttribute("viewBox") !== "0 0 980 560" ||
      Math.abs(
        graphic.getBoundingClientRect().width / frame.clientWidth -
          (window.innerWidth <= 700 ? 1.55 : 1),
      ) > 0.01 ||
      getComputedStyle(graphic).minHeight !==
        (window.innerWidth <= 700 ? "260px" : "360px") ||
      !getComputedStyle(frame).backgroundImage.includes("radial-gradient")
    )
      throw new Error("Declarative network lost its compiled projection frame");
    window.scrollTo(0, 0);
  });
  await verifyMapMotion(page);
  await saveArtifactScreenshot(
    page,
    `dashboard-network-declarative-${viewport.width}x${viewport.height}-${climate}.png`,
  );
}

async function verifyDenseAtlas({
  page,
  viewport,
  climate,
  origin,
}: VisualCase): Promise<void> {
  await navigateToNetworkIdle(
    page,
    `${origin}/dashboard?climate=${climate}&fixture-state=dense-map#knowledge`,
  );
  await evaluatePage(page, async () => {
    await document.fonts.ready;
    const index = document.querySelector<HTMLElement>("[data-map-index]");
    const remainder = index?.querySelector("[data-map-index-remainder]");
    const note = index?.querySelector("[data-map-index-note]");
    const controls = index?.querySelectorAll("button");
    if (!index || !remainder || !note || controls?.length !== 8)
      throw new Error("Dense atlas lost its bounded index and remainder");
    if (
      !remainder.textContent.includes("12 smaller territories") ||
      index.scrollWidth > index.clientWidth + 1
    )
      throw new Error("Dense atlas lost source detail or bounds");
    if (
      window.innerWidth > 700 &&
      note.getBoundingClientRect().top <
        remainder.getBoundingClientRect().bottom - 1
    )
      throw new Error("Dense atlas guidance overlaps its remainder");
    if (
      remainder.getBoundingClientRect().top <
        Math.max(
          ...Array.from(
            controls,
            (control) => control.getBoundingClientRect().bottom,
          ),
        ) -
          1 ||
      (window.innerWidth > 700 &&
        note.getBoundingClientRect().bottom >
          index.getBoundingClientRect().bottom + 1)
    )
      throw new Error("Dense atlas clips or overlaps its full record list");
    for (const control of controls) {
      if (
        control.title !== control.querySelector("strong")?.textContent ||
        (window.innerWidth <= 700 &&
          control.getBoundingClientRect().height < 44)
      )
        throw new Error("Dense atlas lost full labels or usable controls");
    }
    const labels = Array.from(
      document.querySelectorAll<SVGTextElement>("[data-knowledge-label]"),
    );
    if (labels.length !== 7)
      throw Error("Dense atlas lost its seven source labels");
    for (const label of labels) {
      if (
        label.querySelector("title")?.textContent !==
          label.getAttribute("aria-label") ||
        label.getAttribute("data-label-truncated") !== "true"
      )
        throw Error(
          "Crowded label lost its full source title or explicit truncation",
        );
      const box = label.getBBox();
      if (
        box.x < 4 ||
        box.x + box.width > 816 ||
        box.y < 0 ||
        box.y + box.height > 480
      )
        throw Error("Territory label is outside its SVG bounds");
      for (const other of labels) {
        if (other === label) continue;
        const target = other.getBBox();
        if (
          box.x < target.x + target.width + 2 &&
          box.x + box.width + 2 > target.x &&
          box.y < target.y + target.height + 2 &&
          box.y + box.height + 2 > target.y
        )
          throw Error("Dense territory labels overlap");
      }
    }
    index.scrollIntoView({ block: "start" });
  });
  await saveArtifactScreenshot(
    page,
    `dashboard-knowledge-index-dense-${viewport.width}x${viewport.height}-${climate}.png`,
  );
}
