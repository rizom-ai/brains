import {
  evaluatePage,
  evaluatePageWith,
  runPageChecks,
  waitForPage,
} from "./page";

export async function verifyMapMotion(page: Bun.WebView): Promise<void> {
  await page.cdp("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
  });
  try {
    await evaluatePage(page, () => {
      const marks = document.querySelectorAll(
        ".knowledge-weave,.knowledge-zone-contour,.knowledge-point,.proximity-spore,.proximity-center-halo,.proximity-node-glow",
      );
      if (marks.length < 5) throw Error("Missing animated map marks");
      for (const mark of marks)
        if (getComputedStyle(mark).animationName === "none")
          throw Error("Map lost its compiled animation");
    });
    await page.cdp("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    await evaluatePage(page, () => {
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
        throw Error("Reduced-motion emulation failed");
      const marks = document.querySelectorAll(
        ".knowledge-weave,.knowledge-zone-contour,.knowledge-point,.proximity-spore,.proximity-center-halo,.proximity-node-glow",
      );
      for (const mark of marks) {
        const style = getComputedStyle(mark);
        if (
          style.animationName !== "none" ||
          Number.parseFloat(style.opacity) !== 1 ||
          style.transform !== "none"
        )
          throw Error("Reduced-motion map marks are animated or hidden");
      }
      for (const path of document.querySelectorAll(
        ".knowledge-weave,.knowledge-zone-contour",
      ))
        if (Number.parseFloat(getComputedStyle(path).strokeDashoffset) !== 0)
          throw Error("Reduced-motion contours did not finish drawing");
    });
  } finally {
    await page.cdp("Emulation.setEmulatedMedia", { features: [] });
  }
  await Bun.sleep(1200);
}

/** Elements and values the chrome checks hand to the checks after them. */
interface DashboardChromeState {
  header?: Element;
  frame?: HTMLElement;
  overview?: HTMLElement;
  knowledge?: HTMLElement;
  previousHash?: string;
  atlas?: HTMLElement;
  atlasSummary?: HTMLElement;
  firstTerritory?: HTMLButtonElement;
  systemTab?: HTMLElement;
  systemPanel?: HTMLElement;
  checks?: HTMLTableElement;
}

/**
 * The compiled Dashboard chrome: climate, framing, panels, tabs, the
 * knowledge map, the network, and the System section. The checks run in one
 * evaluation, in order — later ones read the tab and map state earlier ones
 * leave — and the last restores Overview, the hash, and every scroll offset.
 */
export async function verifyDashboardChrome(page: Bun.WebView): Promise<void> {
  await waitForPage("Dashboard tabs initialized", () =>
    evaluatePage(page, () =>
      document.documentElement.classList.contains("dashboard-tabs-ready"),
    ),
  );
  await runPageChecks<DashboardChromeState>(page, [
    documentFoundation,
    headerDestinations,
    frameGeometry,
    panelInsets,
    sectionHeadings,
    climateToggle,
    keyboardTabs,
    knowledgeMapFraming,
    knowledgeMapSummary,
    territorySelection,
    territoryGuidance,
    mapLegend,
    leadingTerritoryRestored,
    networkVisualization,
    systemActivation,
    systemPanelLayout,
    systemStatus,
    systemCheckMetadata,
    referenceFacts,
    runtimeMetadata,
    homeKeyRestoresOverview,
  ]);
}

// Page checks: serialized into the page, so each is self-contained.

function documentFoundation(): void {
  const paper = document.documentElement.dataset["climate"] === "paper";
  const bodyStyle = getComputedStyle(document.body),
    grain = getComputedStyle(document.body, "::before"),
    vignette = getComputedStyle(document.body, "::after");
  if (
    bodyStyle.fontSize !== "14px" ||
    bodyStyle.lineHeight !== "21px" ||
    bodyStyle.overflowX !== "clip" ||
    grain.opacity !== (paper ? "0.06" : "0.035") ||
    grain.mixBlendMode !== (paper ? "multiply" : "overlay") ||
    vignette.opacity !== (paper ? "0.7" : "0.55") ||
    !grain.backgroundImage.includes("feTurbulence") ||
    !vignette.backgroundImage.includes("radial-gradient") ||
    (paper && !vignette.backgroundImage.includes("-10%"))
  )
    throw Error("Compiled document foundation lost its climate treatment");
  for (const overlay of [grain, vignette])
    if (
      overlay.position !== "fixed" ||
      overlay.pointerEvents !== "none" ||
      overlay.zIndex !== "0"
    )
      throw Error(
        "Document ambience intercepts or overlays content incorrectly",
      );
}

function headerDestinations(state: DashboardChromeState): void {
  const header = document.querySelector(".public-header");
  if (
    !header ||
    header.querySelector("a")?.getAttribute("href") !== "/dashboard"
  )
    throw new Error("Dashboard lost its home link");
  if (
    header.querySelector(".public-header-ask")?.getAttribute("href") !==
      "/ask" ||
    header.querySelector(".public-header-sign-in")?.getAttribute("href") !==
      "/login"
  )
    throw new Error("Dashboard changed its guest or sign-in destinations");
  if (window.innerWidth <= 640) {
    for (const link of header.querySelectorAll("a"))
      if (link.getBoundingClientRect().height < 44)
        throw new Error("Public header lost a phone touch target");
    const description = document.querySelector(".masthead p");
    if (!description || getComputedStyle(description).paddingBottom !== "0px")
      throw new Error("Phone masthead retained desktop description spacing");
  }
  state.header = header;
}

function frameGeometry(state: DashboardChromeState): void {
  const frame = document.querySelector<HTMLElement>(".frame");
  const canvas = document.querySelector(".canvas");
  const sections = document.querySelector(".dashboard-tab-panels");
  const footer = document.querySelector(".colophon");
  if (!frame || !canvas || !sections || !footer)
    throw new Error("Missing shared Dashboard framing");
  const phone = window.innerWidth <= 640;
  const frameStyle = getComputedStyle(frame);
  if (
    Math.abs(
      frame.getBoundingClientRect().width -
        Math.min(1280, window.innerWidth * 0.96),
    ) > 1 ||
    frameStyle.borderLeftWidth !== (phone ? "0px" : "1px") ||
    getComputedStyle(canvas).paddingLeft !== (phone ? "14px" : "26px") ||
    getComputedStyle(sections).gap !== (phone ? "24px" : "42px") ||
    getComputedStyle(footer).marginTop !== "32px"
  )
    throw new Error("Compiled frame changed its responsive geometry");
  if (phone) {
    if (frameStyle.boxShadow !== "none")
      throw new Error("Phone frame retained a desktop shadow");
    for (const link of footer.querySelectorAll("a"))
      if (link.getBoundingClientRect().height < 44)
        throw new Error("Footer lost a phone touch target");
  }
  if (!phone) {
    const expectedShadowOffset =
      document.documentElement.getAttribute("data-climate") === "paper"
        ? "22px"
        : "30px";
    if (!frameStyle.boxShadow.includes(expectedShadowOffset))
      throw new Error("Frame lost its climate shadow");
  }
  state.frame = frame;
}

function panelInsets(): void {
  const phone = window.innerWidth <= 640;
  const cards = [...document.querySelectorAll<HTMLElement>(".card")];
  if (cards.length < 13) throw new Error("Missing public Dashboard panels");
  for (const card of cards) {
    const style = getComputedStyle(card);
    const edgeAligned = card.classList.contains("system-health-card");
    const tight = card.classList.contains("map-card");
    const bottom = edgeAligned
      ? "0px"
      : phone
        ? tight
          ? "12px"
          : "14px"
        : "16px";
    const left = edgeAligned || !phone ? "18px" : tight ? "12px" : "14px";
    const heading = card.querySelector(":scope > header");
    if (
      style.borderTopWidth !== "1px" ||
      style.paddingBottom !== bottom ||
      style.paddingLeft !== left ||
      style.containerType !== "inline-size" ||
      style.containerName !== "operator-panel" ||
      !heading ||
      getComputedStyle(heading).marginBottom !== (phone ? "10px" : "12px") ||
      card.scrollWidth > card.clientWidth + 1
    )
      throw new Error(
        "Compiled panel changed its inset, heading, containment, or bounds",
      );
  }
}

function sectionHeadings(state: DashboardChromeState): void {
  const { frame } = state;
  if (!frame) throw new Error("Missing shared Dashboard framing");
  const sectionHead = document.querySelector("#knowledge > header");
  const activeSection = frame.getAttribute("data-ui-tabs-active");
  if (
    !sectionHead ||
    activeSection === null ||
    getComputedStyle(sectionHead).display !== "none"
  )
    throw new Error("Enhanced sections retained duplicate headings");
  frame.removeAttribute("data-ui-tabs-active");
  try {
    if (getComputedStyle(sectionHead).display === "none")
      throw new Error("Unenhanced sections lost their native headings");
  } finally {
    frame.setAttribute("data-ui-tabs-active", activeSection);
  }
}

function climateToggle(state: DashboardChromeState): void {
  const { header } = state;
  if (!header) throw new Error("Dashboard lost its home link");
  const climate = header.querySelector<HTMLButtonElement>("#climateToggle");
  if (!climate) throw new Error("Missing climate control");
  if (getComputedStyle(climate).display !== "none") {
    const before = document.documentElement.getAttribute("data-climate");
    climate.click();
    if (document.documentElement.getAttribute("data-climate") === before)
      throw new Error("Climate control no longer toggles");
    climate.click();
    if (document.documentElement.getAttribute("data-climate") !== before)
      throw new Error("Climate control did not restore the selected climate");
  }
}

function keyboardTabs(state: DashboardChromeState): void {
  const overview = document.querySelector<HTMLElement>(
    '[data-dashboard-tab-link="overview"]',
  );
  const knowledge = document.querySelector<HTMLElement>(
    '[data-dashboard-tab-link="knowledge"]',
  );
  if (!overview || !knowledge)
    throw new Error("Missing Dashboard section links");
  state.overview = overview;
  state.knowledge = knowledge;
  state.previousHash = window.location.hash;
  overview.focus();
  overview.dispatchEvent(
    new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
  );
  const overviewPanel = document.getElementById("overview");
  if (
    document.activeElement !== knowledge ||
    knowledge.getAttribute("aria-selected") !== "true" ||
    window.location.hash !== "#knowledge" ||
    document.getElementById("knowledge")?.hasAttribute("hidden") ||
    !overviewPanel ||
    getComputedStyle(overviewPanel).display !== "none"
  )
    throw new Error(
      "Dashboard keyboard tabs lost state, focus, or hash navigation",
    );
  const selected = getComputedStyle(knowledge),
    other = getComputedStyle(overview);
  if (
    selected.borderBottomWidth !== "2px" ||
    selected.borderBottomColor === other.borderBottomColor
  )
    throw new Error(
      `Compiled tabs did not reflect selected ARIA state: ${selected.borderBottomWidth}, ${selected.borderBottomColor} / ${other.borderBottomColor}`,
    );
}

function knowledgeMapFraming(state: DashboardChromeState): void {
  const atlas = document.querySelector<HTMLElement>(".knowledge-map-field");
  const atlasCanvas = atlas?.querySelector<HTMLElement>(
    ".knowledge-map-canvas",
  );
  const atlasGraphic = atlasCanvas?.querySelector("svg");
  const atlasSummary = document.querySelector<HTMLElement>(
    ".knowledge-atlas-summary",
  );
  if (!atlas || !atlasCanvas || !atlasGraphic || !atlasSummary)
    throw new Error("Missing shared map framing");
  const phoneMap = window.innerWidth <= 700;
  if (
    getComputedStyle(atlas).gridTemplateColumns.split(" ").length !==
      (phoneMap ? 1 : 2) ||
    getComputedStyle(atlasGraphic).minHeight !==
      (phoneMap ? "320px" : "480px") ||
    Math.abs(
      atlasGraphic.getBoundingClientRect().width / atlasCanvas.clientWidth -
        (phoneMap ? 1.4 : 1),
    ) > 0.01
  )
    throw new Error("Map framing lost its responsive projection geometry");
  const paperMap =
    document.documentElement.getAttribute("data-climate") === "paper";
  if (
    !getComputedStyle(atlas).boxShadow.includes(
      paperMap ? "90, 60, 20" : "0, 0, 0",
    )
  )
    throw new Error("Map inset shadow lost its climate");
  state.atlas = atlas;
  state.atlasSummary = atlasSummary;
}

function knowledgeMapSummary(state: DashboardChromeState): void {
  const { atlasSummary } = state;
  if (!atlasSummary) throw new Error("Missing shared map framing");
  const phoneMap = window.innerWidth <= 700;
  const values = atlasSummary.querySelectorAll("dd strong");
  const labels = atlasSummary.querySelectorAll("dt");
  if (
    values.length !== 3 ||
    labels.length !== 3 ||
    !values[0] ||
    !labels[0] ||
    getComputedStyle(values[0]).fontSize !== (phoneMap ? "20px" : "23px") ||
    getComputedStyle(labels[0]).fontSize !== (phoneMap ? "6.5px" : "8px")
  )
    throw new Error("Map summary lost its numeric hierarchy");
  const mapStatus = atlasSummary.querySelector("p");
  if (!mapStatus) throw new Error("Missing map summary status");
  const originalStatusChildren = Array.from(mapStatus.childNodes);
  const originalValue = values[0].textContent;
  try {
    mapStatus.textContent = "long-source-status".repeat(20);
    values[0].textContent = "1234567890".repeat(30);
    if (atlasSummary.scrollWidth > atlasSummary.clientWidth + 1)
      throw new Error("Long map summary data escaped its frame");
  } finally {
    mapStatus.replaceChildren(...originalStatusChildren);
    values[0].textContent = originalValue;
  }
}

function territorySelection(state: DashboardChromeState): void {
  const { atlas } = state;
  if (!atlas) throw new Error("Missing shared map framing");
  const phoneMap = window.innerWidth <= 700;
  const territoryControls = atlas.querySelectorAll<HTMLButtonElement>(
    "[data-knowledge-zone-ref]",
  );
  const firstTerritory = territoryControls[0],
    secondTerritory = territoryControls[1];
  if (!firstTerritory || !secondTerritory)
    throw new Error("Missing source territory controls");
  for (const control of territoryControls) {
    if (
      control.classList.contains("is-active") ||
      (phoneMap && control.getBoundingClientRect().height < 44)
    )
      throw new Error(
        "Territory controls lost native-state styling or phone targets",
      );
  }
  const selectedTerritoryBackground =
    getComputedStyle(firstTerritory).backgroundColor;
  secondTerritory.focus();
  if (
    getComputedStyle(secondTerritory).backgroundColor !==
      selectedTerritoryBackground ||
    getComputedStyle(firstTerritory).backgroundColor ===
      selectedTerritoryBackground
  )
    throw new Error("Territory selection did not follow ARIA state");
  const activeZone = atlas.querySelector(
    '.knowledge-zone[data-map-active="true"]',
  );
  if (!activeZone) throw new Error("Missing selected region");
  if (
    secondTerritory.getAttribute("aria-pressed") !== "true" ||
    activeZone.getAttribute("data-knowledge-zone") !==
      secondTerritory.getAttribute("data-knowledge-zone-ref")
  )
    throw new Error("Map focus no longer traces its source territory");
  const activeContours = activeZone.querySelectorAll(".knowledge-zone-contour");
  const inactiveContours = atlas.querySelectorAll(
    '.knowledge-zone[data-map-active="false"] .knowledge-zone-contour',
  );
  if (
    activeContours.length !== 3 ||
    inactiveContours.length < 3 ||
    Array.from(activeContours).some(
      (path) =>
        Number.parseFloat(getComputedStyle(path).strokeOpacity) !== 0.58,
    ) ||
    Array.from(inactiveContours).some(
      (path, index) =>
        getComputedStyle(path).strokeOpacity !==
        ["0.23", "0.34", "0.22"][index % 3],
    )
  )
    throw new Error("Region paint no longer follows explicit map selection");
  state.firstTerritory = firstTerritory;
}

/** Leaves the map, so its guidance must sit below the source records. */
function territoryGuidance(state: DashboardChromeState): void {
  const { atlas, knowledge } = state;
  if (!atlas) throw new Error("Missing shared map framing");
  if (!knowledge) throw new Error("Missing Dashboard section links");
  const phoneMap = window.innerWidth <= 700;
  knowledge.focus();
  const indexNote = atlas.querySelector("[data-map-index-note]");
  const indexList = atlas.querySelector("ol");
  if (
    !indexNote ||
    !indexList ||
    (!phoneMap &&
      (getComputedStyle(indexNote).position === "absolute" ||
        indexNote.getBoundingClientRect().top <
          indexList.getBoundingClientRect().bottom - 1))
  )
    throw new Error("Territory guidance overlaps its source records");
}

function mapLegend(): void {
  const markers = document.querySelectorAll("#knowledge [data-map-marker]");
  if (markers.length === 0) throw new Error("Missing compiled map legend");
  for (const marker of markers) {
    const dot = marker.querySelector("i");
    if (!dot) throw new Error("Missing legend marker");
    if (
      dot.getAttribute("aria-hidden") !== "true" ||
      getComputedStyle(dot).width !== "8px"
    )
      throw new Error("Legend marker lost its compiled shape");
    if (
      marker.getAttribute("data-map-marker") === "dashed-ring" &&
      getComputedStyle(dot).borderTopStyle !== "dashed"
    )
      throw new Error("Legend lost its explicit grouping marker");
  }
}

function leadingTerritoryRestored(state: DashboardChromeState): void {
  if (state.firstTerritory?.getAttribute("aria-pressed") !== "true")
    throw new Error("Map focus exit did not restore the leading territory");
}

function networkVisualization(): void {
  const networkTab = document.querySelector<HTMLElement>(
    '[data-ui-tab="network"]',
  );
  if (!networkTab) throw new Error("Missing Network section");
  networkTab.click();
  const field = document.querySelector(".proximity-field");
  const plot = field?.querySelector(":scope > svg");
  if (!field || !plot)
    throw new Error("Missing registered proximity visualization");
  const fieldWidth = field.getBoundingClientRect().width;
  const expectedPlotWidth = fieldWidth * (fieldWidth <= 700 ? 1.26 : 1);
  if (Math.abs(plot.getBoundingClientRect().width - expectedPlotWidth) > 1)
    throw new Error(
      "Registered visualization lost its shared panel container query",
    );
}

function systemActivation(state: DashboardChromeState): void {
  const systemTab = document.querySelector<HTMLElement>(
    '[data-ui-tab="system"]',
  );
  const systemPanel = document.getElementById("system");
  if (!systemTab || !systemPanel) throw new Error("Missing System section");
  systemTab.click();
  if (
    systemPanel.hasAttribute("hidden") ||
    systemTab.getAttribute("aria-selected") !== "true"
  )
    throw new Error("System section did not activate");
  for (const card of systemPanel.querySelectorAll<HTMLElement>(".card")) {
    if (
      card.getBoundingClientRect().height <= 0 ||
      card.scrollWidth > card.clientWidth + 1
    )
      throw new Error("System panel content is hidden or overflowing");
  }
  state.systemTab = systemTab;
  state.systemPanel = systemPanel;
}

function systemPanelLayout(state: DashboardChromeState): void {
  const { systemPanel } = state;
  if (!systemPanel) throw new Error("Missing System section");
  const columns = systemPanel.querySelector(
    '[data-columns-presentation="panels"]',
  );
  const primaryColumns = columns?.firstElementChild;
  const supporting = columns?.querySelector(":scope > aside");
  if (
    !columns ||
    !primaryColumns ||
    !supporting ||
    getComputedStyle(columns).gap !== "14px" ||
    getComputedStyle(columns).gridTemplateColumns.split(" ").length !==
      (window.innerWidth <= 960 ? 1 : 2) ||
    getComputedStyle(primaryColumns).gridTemplateColumns.split(" ").length !==
      (window.innerWidth <= 700 ? 1 : 2) ||
    getComputedStyle(supporting).display !==
      (window.innerWidth <= 960 ? "grid" : "flex")
  )
    throw new Error(
      "System lost its responsive primary/supporting panel layout",
    );
  if (
    window.innerWidth <= 960 &&
    getComputedStyle(supporting).gridTemplateColumns.split(" ").length !==
      (window.innerWidth <= 700 ? 1 : 3)
  )
    throw new Error("Supporting panels lost their tablet/phone columns");
  for (const card of systemPanel.querySelectorAll(
    ".system-health-card,.system-checks-card",
  ))
    if (
      Math.abs(
        card.getBoundingClientRect().width -
          primaryColumns.getBoundingClientRect().width,
      ) > 1
    )
      throw new Error("A spanning System panel lost the full primary width");
}

function systemStatus(state: DashboardChromeState): void {
  const { systemPanel } = state;
  if (!systemPanel) throw new Error("Missing System section");
  const summary = systemPanel.querySelector("[data-status-summary]");
  const band = systemPanel.querySelector('[data-stats-presentation="band"]');
  const readiness = systemPanel.querySelector(
    '[data-readiness-tone] [role="img"]',
  );
  const checks = systemPanel.querySelector("table");
  if (!summary || !band || !readiness || !checks)
    throw new Error("Missing compiled System content");
  const firstMetric = band.firstElementChild;
  if (!firstMetric) throw new Error("Missing snapshot metrics");
  if (
    getComputedStyle(band).gridTemplateColumns.split(" ").length !==
      (window.innerWidth <= 700 ? 1 : 3) ||
    getComputedStyle(firstMetric).borderTopWidth !== "0px" ||
    getComputedStyle(readiness).width !==
      (window.innerWidth <= 420 ? "68px" : "78px")
  )
    throw new Error(
      "Snapshot band or readiness indicator lost its responsive geometry",
    );
  if (
    checks.querySelectorAll('thead th[scope="col"]').length !== 3 ||
    checks.querySelectorAll('tbody th[scope="row"]').length !== 3
  )
    throw new Error("System checks lost their semantic headers");
  for (const updated of checks.querySelectorAll("tbody td:first-of-type"))
    if (
      getComputedStyle(updated).display === "none" ||
      updated.getBoundingClientRect().height < 1
    )
      throw new Error(
        "System check update metadata became unavailable on phones",
      );
  state.checks = checks;
}

function systemCheckMetadata(state: DashboardChromeState): void {
  const { systemPanel, checks } = state;
  if (!systemPanel || !checks)
    throw new Error("Missing compiled System content");
  const operation = checks.querySelector("tbody strong"),
    diagnostic = checks.querySelector("tbody small"),
    status = checks.querySelector("tbody td:last-child span");
  const checkPanel = systemPanel.querySelector<HTMLElement>(
    ".system-checks-card",
  );
  if (!operation || !diagnostic || !status || !checkPanel)
    throw new Error("Missing check records");
  const copy = [
    operation.textContent,
    diagnostic.textContent,
    status.textContent,
  ];
  try {
    operation.textContent = "exact-operation-identifier".repeat(24);
    diagnostic.textContent = "Full diagnostic without truncation. ".repeat(24);
    status.textContent = "long-status-token".repeat(24);
    if (checkPanel.scrollWidth > checkPanel.clientWidth + 1)
      throw new Error("Long check metadata escaped its panel");
  } finally {
    operation.textContent = copy[0] ?? "";
    diagnostic.textContent = copy[1] ?? "";
    status.textContent = copy[2] ?? "";
  }
}

function referenceFacts(state: DashboardChromeState): void {
  const { systemPanel } = state;
  if (!systemPanel) throw new Error("Missing System section");
  const facts = systemPanel.querySelectorAll(
    '[data-facts-presentation="reference"]',
  );
  if (facts.length !== 2) throw new Error("Missing public reference facts");
  for (const row of systemPanel.querySelectorAll(
    '[data-facts-presentation="reference"] > div',
  )) {
    const label = row.querySelector("dt"),
      value = row.querySelector("dd");
    if (
      !label ||
      !value ||
      getComputedStyle(row).paddingTop !== "8px" ||
      getComputedStyle(label).fontSize !== "9.5px" ||
      getComputedStyle(value).fontSize !== "10.5px"
    )
      throw new Error("Reference facts lost their compiled row hierarchy");
  }
}

function runtimeMetadata(state: DashboardChromeState): void {
  const { systemPanel } = state;
  if (!systemPanel) throw new Error("Missing System section");
  const version = systemPanel.querySelector(".system-runtime-card dd");
  const runtime = systemPanel.querySelector<HTMLElement>(
    ".system-runtime-card",
  );
  if (!version || !runtime) throw new Error("Missing public runtime metadata");
  const versionText = version.textContent;
  try {
    version.textContent = "long-version-token".repeat(40);
    if (runtime.scrollWidth > runtime.clientWidth + 1)
      throw new Error("Long public metadata escaped its panel");
  } finally {
    version.textContent = versionText;
  }
  if (
    !systemPanel.querySelector("time[datetime]") ||
    !systemPanel.querySelector("header > .system-scope-mark")
  )
    throw new Error(
      "System lost its exact timestamp or direct public-scope accessory",
    );
}

function homeKeyRestoresOverview(state: DashboardChromeState): void {
  const { systemTab, overview, previousHash } = state;
  if (!systemTab) throw new Error("Missing System section");
  if (!overview || previousHash === undefined)
    throw new Error("Missing Dashboard section links");
  systemTab.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Home", bubbles: true }),
  );
  if (
    document.activeElement !== overview ||
    overview.getAttribute("aria-selected") !== "true"
  )
    throw new Error("Dashboard Home key did not restore Overview");
  overview.blur();
  for (
    let node: HTMLElement | null = overview;
    node;
    node = node.parentElement
  ) {
    node.scrollTop = 0;
    node.scrollLeft = 0;
  }
  window.history.replaceState(
    null,
    "",
    window.location.pathname + window.location.search + previousHash,
  );
}

export async function verifyDashboardSummary(page: Bun.WebView): Promise<void> {
  const target = await evaluatePage(page, () => {
    const phone = window.innerWidth <= 640;
    const paragraph = document.querySelector(".public-identity-card p");
    const ledger = document.querySelector(
      '.public-holdings-card [data-stats-presentation="ledger"]',
    );
    const links = [
      ...document.querySelectorAll<HTMLAnchorElement>(
        ".public-contact-card li > a",
      ),
    ];
    const link = links[0];
    if (!paragraph || !ledger || !link || links.length !== 3)
      throw new Error(
        "Overview lost its public copy, totals, or contact sources",
      );
    if (
      getComputedStyle(paragraph).fontSize !== (phone ? "13px" : "14px") ||
      getComputedStyle(ledger).gridTemplateColumns.split(" ").length !==
        (phone ? 2 : 4)
    )
      throw new Error(
        "Compiled overview copy or totals changed their responsive hierarchy",
      );
    const values = [...ledger.querySelectorAll("dd")];
    if (
      values.length !== 4 ||
      values.some(
        (value) =>
          getComputedStyle(value).fontSize !== (phone ? "25px" : "28px"),
      )
    )
      throw new Error("Overview lost its four source-supplied totals");
    for (const item of links) {
      if (phone && item.getBoundingClientRect().height < 44)
        throw new Error("A public contact link lost its phone touch target");
    }
    const skills = document.querySelectorAll(
      '.public-skills-card li[data-tone="good"]',
    );
    if (
      skills.length !== 3 ||
      [...skills].some(
        (row) =>
          row.querySelector("a") !== null ||
          row.querySelector('[aria-hidden="true"]') === null,
      )
    )
      throw new Error(
        "Skill summaries changed into links or lost their positive marker",
      );
    const longLabel = link.querySelector("strong");
    const longBadge = link.querySelector("small");
    if (!longLabel || !longBadge)
      throw new Error("Missing summary copy or badge");
    const labelText = longLabel.textContent,
      badgeText = longBadge.textContent;
    try {
      longLabel.textContent = "unbroken-summary-label".repeat(40);
      longBadge.textContent = "unbroken-badge".repeat(40);
      if (link.scrollWidth > link.clientWidth + 1)
        throw new Error("Long authored summary copy overflowed its link");
    } finally {
      longLabel.textContent = labelText;
      longBadge.textContent = badgeText;
    }
    link.scrollIntoView({ block: "center" });
    link.focus();
    if (
      !link.matches(":focus-visible") ||
      getComputedStyle(link).outlineWidth !== "2px"
    )
      throw new Error("Public contact keyboard focus is not visible");
    link.blur();
    const rect = link.getBoundingClientRect();
    return {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
      href: link.getAttribute("href"),
    };
  });
  await page.cdp("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: target.x,
    y: target.y,
  });
  try {
    await waitForPage("Summary link hover transition", () =>
      evaluatePage(page, () => {
        const label = document.querySelector(
          ".public-contact-card li > a strong",
        );
        const primary = document.querySelector(".public-header-ask");
        return (
          !!label &&
          !!primary &&
          getComputedStyle(label).color ===
            getComputedStyle(primary).backgroundColor
        );
      }),
    );
    await evaluatePageWith(
      page,
      (href) => {
        const link = document.querySelector(".public-contact-card li > a");
        const label = link?.querySelector("strong");
        const primary = document.querySelector(".public-header-ask");
        if (
          !link ||
          !label ||
          !primary ||
          !link.matches(":hover") ||
          getComputedStyle(label).color !==
            getComputedStyle(primary).backgroundColor ||
          link.getAttribute("href") !== href
        )
          throw new Error(
            `Compiled summary hover: hovered=${link?.matches(":hover")}, color=${label ? getComputedStyle(label).color : "missing"}, accent=${primary ? getComputedStyle(primary).backgroundColor : "missing"}, destination=${link?.getAttribute("href") === href}`,
          );
      },
      target.href,
    );
  } finally {
    await page.cdp("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: 0,
      y: 0,
    });
    await evaluatePage(page, () => {
      window.scrollTo(0, 0);
    });
    await waitForPage("Summary hover cleared", () =>
      evaluatePage(page, () => {
        const label = document.querySelector(
          ".public-contact-card li > a strong",
        );
        const unlinked = document.querySelector(".public-skills-card strong");
        return (
          !!label &&
          !!unlinked &&
          getComputedStyle(label).color === getComputedStyle(unlinked).color
        );
      }),
    );
  }
}
