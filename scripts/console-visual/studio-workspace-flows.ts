import {
  type VisualCase,
  auditStudioAccessibility,
  recordVisualCapture,
  saveArtifactScreenshot,
  screenshot,
  settleVisualCapture,
} from "./capture";
import {
  activateWorkspaceTab,
  clickSelector,
  clickText,
  evaluatePage,
  evaluatePageWith,
  fillLabel,
  waitForPage,
  waitForSelector,
  waitForText,
} from "./page";
import { verifyCollectionFiltersFit } from "./studio-checks";

/**
 * Desktop collapses the rail, then browses Work without leaving the
 * document; phone opens the context sheet. Collapsed surfaces capture the
 * folded state.
 */
export async function exerciseStudioNavigation({
  page,
  surface,
  viewport,
}: VisualCase): Promise<void> {
  if (viewport.width > 900) {
    await clickSelector(page, ".studio-navigation-collapse");
    await waitForPage("collapsed shell width", () =>
      page.evaluate<boolean>(
        'Math.round(document.querySelector(".rail").getBoundingClientRect().width) === 68 && getComputedStyle(document.querySelector(".studio-leaf-rail")).display === "none"',
      ),
    );
    const currentPath = await page.evaluate<string>("location.pathname");
    await clickText(page, ".studio-area-link", "Work");
    if ((await page.evaluate<string>("location.pathname")) !== currentPath) {
      throw new Error("Browsing Work navigated away from the current document");
    }
    await waitForSelector(
      page,
      '.studio-leaf-rail[aria-label="Work destinations"]',
    );
    await waitForPage("area click expands shell", () =>
      page.evaluate<boolean>(
        'Math.round(document.querySelector(".rail").getBoundingClientRect().width) === 344',
      ),
    );
    if (surface.endsWith("-collapsed"))
      await clickSelector(page, ".studio-navigation-collapse");
  } else {
    await clickSelector(page, ".studio-mobile-switcher");
    await waitForSelector(page, ".studio-mobile-navigation-sheet");
    if (surface.endsWith("-collapsed"))
      await clickText(
        page,
        ".studio-mobile-navigation-group summary",
        "Library",
      );
  }
}

/** Pages, searches, filters, and walks history through the library. */
export async function exerciseStudioLibrary({
  page,
  viewport,
  climate,
}: VisualCase): Promise<void> {
  await waitForText(page, "1–25 of 54");
  await clickText(page, ".listing-pagination button", "Next");
  await waitForText(page, "26–50 of 54");
  await waitForText(page, "Archive note 22");
  await clickText(page, ".listing-pagination button", "Previous");
  await waitForText(page, "A console that travels well");
  await waitForText(page, "1–25 of 54");
  await clickText(page, ".listing-pagination button", "Next");
  await fillLabel(page, "Search title or content", "Archive note 22");
  // One page of results has no pager; the filter bar states the match.
  await waitForText(page, "1 match");
  await evaluatePage(page, () => {
    if (new URLSearchParams(location.search).has("offset"))
      throw new Error("Searching must reset collection offset");
  });
  await clickText(
    page,
    ".studio-collection-controls summary",
    "Filter and sort",
  );
  await verifyCollectionFiltersFit(page);
  await settleVisualCapture(page);
  const filtersName = `studio-library-filters-${viewport.width}x${viewport.height}-${climate}`;
  await auditStudioAccessibility(page, filtersName);
  await recordVisualCapture(`${filtersName}.png`, await screenshot(page));
  await evaluatePage(page, () => {
    const select = document.querySelector<HTMLSelectElement>(
      ".studio-collection-controls select",
    );
    if (!select) throw new Error("Visibility filter missing");
    select.value = "restricted";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await waitForText(page, "No entries match these filters");
  await clickText(page, ".studio-collection-controls button", "Clear");
  await waitForText(page, "1–25 of 54");
  await evaluatePage(page, () => history.back());
  await waitForText(page, "No entries match these filters");
  await evaluatePage(page, () => history.forward());
  await waitForText(page, "1–25 of 54");
  await evaluatePage(page, () => {
    const details = document.querySelector<HTMLDetailsElement>(
      ".studio-collection-controls details",
    );
    if (details) details.open = false;
  });
}

/** Sync diagnostics keep every operation; repository facts stay exact. */
export async function exerciseContentSync({
  page,
  viewport,
  climate,
}: VisualCase): Promise<void> {
  await waitForText(page, "Recent runs");
  await waitForText(page, "Connection");
  await waitForText(page, "Repository sync needs attention");
  await clickText(page, "button", "View diagnostics");
  await waitForSelector(page, '[role="dialog"]');
  await evaluatePage(page, () => {
    const dialog = document.querySelector('[role="dialog"]');
    for (const record of [
      "git push origin main exited with 1",
      "git pull origin main exited with 1",
      "Occurred: 2026-07-11T09:15:00.000Z",
      "Occurred: 2026-07-11T09:14:30.000Z",
    ]) {
      if (!dialog?.textContent.includes(record))
        throw new Error(
          "Sync diagnostics lost a recorded operation or timestamp",
        );
    }
  });
  await clickSelector(page, '[role="dialog"] [aria-label="Close"]');
  await waitForPage("sync diagnostics closed", () =>
    evaluatePage(page, () => !document.querySelector('[role="dialog"]')),
  );
  await clickText(page, "summary", "Repository details");
  await evaluatePage(page, () => {
    const repository = [...document.querySelectorAll("details[open]")].find(
      (node) =>
        node
          .querySelector("summary")
          ?.textContent.includes("Repository details"),
    );
    if (!repository) throw new Error("Missing expanded repository facts");
    const labels = [...repository.querySelectorAll("dt")].map(
      (node) => node.textContent,
    );
    for (const label of [
      "Content files",
      "Issues",
      "Commits ahead",
      "Commits behind",
      "Commit debounce",
    ])
      if (labels.filter((value) => value === label).length !== 1)
        throw new Error(`Repository fact missing or repeated: ${label}`);
    if (!repository.textContent.includes("abcdef123456"))
      throw new Error("Repository details lost the exact commit identifier");
    repository.scrollIntoView({ block: "start" });
    window.scrollBy(0, -64);
  });
  await evaluatePage(page, async () => {
    await document.fonts.ready;
  });
  await saveArtifactScreenshot(
    page,
    `studio-content-sync-repository-${viewport.width}x${viewport.height}-${climate}.png`,
  );
  await clickText(page, "summary", "Repository details");
  await evaluatePage(page, () => {
    let node: HTMLElement | null =
      [...document.querySelectorAll<HTMLElement>("summary")].find((item) =>
        item.textContent.includes("Repository details"),
      ) ?? null;
    while (node) {
      node.scrollTop = 0;
      node = node.parentElement;
    }
  });
}

/** Preview and production keep their links, details, and confirmations. */
export async function exerciseStudioSite(page: Bun.WebView): Promise<void> {
  await waitForText(page, "Build preview");
  await evaluatePage(page, () => {
    const controls = document.querySelector("[data-card-controls]");
    const link = controls?.querySelector("a");
    if (link?.getAttribute("href") !== "https://preview.example.com")
      throw new Error("Published state lost its preview link");
    if (window.innerWidth <= 640 && link.getBoundingClientRect().height < 44)
      throw new Error("Preview link lost its phone touch target");
    for (const details of document.querySelectorAll(
      ".declarative-card:is(details)",
    ))
      if (details.hasAttribute("open"))
        throw new Error("Supporting Site details should start folded");
  });
  await clickText(page, "summary", "Render details");
  await waitForPage("retained render details", () =>
    evaluatePage(page, () =>
      [...document.querySelectorAll("details[open]")].some(
        (node) =>
          node.textContent.includes("Last successful render") &&
          node.textContent.includes("build-20260711163352-preview"),
      ),
    ),
  );
  await clickText(page, "summary", "Render details");
  await clickText(page, "summary", "Configured routes");
  await evaluatePage(page, () => {
    const routes = [...document.querySelectorAll("details[open]")].find(
      (node) => node.textContent.includes("Configured routes"),
    );
    if (
      routes?.querySelectorAll("tbody tr").length !== 8 ||
      !routes.textContent.includes("23 further routes")
    )
      throw new Error(
        "Configured routes lost their bounded preview or remainder",
      );
  });
  await clickText(page, "summary", "Configured routes");
  await activateWorkspaceTab(page, "Production");
  await waitForText(page, "Build production");
  await clickText(page, "button", "Build production");
  await waitForText(page, "Build and publish the production site now?");
  await clickText(
    page,
    '[role="dialog"] button, [role="alertdialog"] button',
    "Cancel",
  );
  await waitForText(page, "Published at");
  await activateWorkspaceTab(page, "Preview");
  await waitForText(page, "Build preview");
}

/** Publishing attention, failure review, queue options, and queue tabs. */
export async function exerciseStudioPublishing(
  page: Bun.WebView,
): Promise<void> {
  await waitForText(page, "Notes from the rhizome");
  await evaluatePage(page, () => {
    if (
      !document
        .querySelector("[data-studio-page-head]")
        ?.textContent.includes("14 published") ||
      document.querySelector('[data-block-id="publishing-summary"]')
    )
      throw Error(
        "Published totals belong in the page head, not a separate body panel",
      );
  });
  await evaluatePage(page, () => {
    const attention = document.querySelector('section[data-tone="warn"]');
    if (
      !attention ||
      document.querySelector('[role="dialog"]') ||
      !attention.querySelector("header")?.textContent.includes("Retries: 1") ||
      !attention
        .querySelector("h2")
        ?.textContent.includes("One delivery needs attention")
    )
      throw new Error(
        "Publishing attention is missing or exposes its controls at rest",
      );
  });
  await clickText(page, "button", "Review failure");
  await waitForSelector(page, '[role="dialog"]');
  await evaluatePage(page, () => {
    const attention = document.querySelector('[role="dialog"]');
    const retry = [...(attention?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent.includes("Retry publication"),
    );
    if (
      !attention?.textContent.includes(
        "Provider rejected the last delivery attempt.",
      ) ||
      !retry ||
      retry.disabled
    )
      throw new Error(
        "Publication review lost diagnostics or its retry action",
      );
  });
  await clickSelector(page, '[role="dialog"] [aria-label="Close"]');
  await waitForPage("failure review closed", () =>
    evaluatePage(page, () => !document.querySelector('[role="dialog"]')),
  );
  await clickText(page, "button", "Queue options");
  await waitForSelector(page, '[role="dialog"]');
  await evaluatePage(page, () => {
    const buttons = [
      ...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'),
    ];
    for (const label of ["Move up", "Move down"]) {
      const button = buttons.find((node) => node.textContent.includes(label));
      if (!button?.disabled)
        throw new Error(
          "Single-item destination must retain disabled reorder boundaries",
        );
    }
    if (
      !buttons.some(
        (button) =>
          button.textContent.includes("Remove from queue") && !button.disabled,
      )
    )
      throw new Error("Queue options lost removal");
  });
  await clickSelector(page, '[role="dialog"] [aria-label="Close"]');
  await waitForPage("queue options closed", () =>
    evaluatePage(page, () => !document.querySelector('[role="dialog"]')),
  );
  await activateWorkspaceTab(page, "Generating (1)");
  await waitForText(page, "og-image");
  await activateWorkspaceTab(page, "Queued (3)");
  await waitForText(page, "Quiet infrastructure");
}

/** Exercises the real account tabs, including native hidden-panel layout. */
export async function exerciseStudioAccount({
  page,
  viewport,
  climate,
}: VisualCase): Promise<void> {
  for (const index of [1, 2, 3, 0]) {
    await evaluatePageWith(
      page,
      (tabIndex) => {
        const tab = document.querySelectorAll<HTMLElement>(
          '.account-details [role="tab"]',
        )[tabIndex];
        if (!tab) throw new Error("Account section missing");
        tab.focus();
        tab.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        );
      },
      index,
    );
    await waitForSelector(
      page,
      `.account-details [role="tab"]:nth-child(${index + 1})[aria-selected="true"]`,
    );
    await evaluatePage(page, () => {
      const panels = [
        ...document.querySelectorAll<HTMLElement>(
          '.account-details [role="tabpanel"]',
        ),
      ];
      if (
        panels.filter((panel) => getComputedStyle(panel).display !== "none")
          .length !== 1
      )
        throw new Error("Inactive account sections must stay hidden");
      const selected = document.querySelector<HTMLElement>(
        '.account-details [role="tab"][aria-selected="true"]',
      );
      const list = selected
        ?.closest('[role="tablist"]')
        ?.getBoundingClientRect();
      const rect = selected?.getBoundingClientRect();
      if (
        !list ||
        !rect ||
        rect.left < list.left - 1 ||
        rect.right > list.right + 1
      )
        throw new Error("Selected account tab must remain fully visible");
    });
    if (index === 3) {
      await clickSelector(
        page,
        '.account-details [role="tabpanel"]:not([hidden]) summary',
      );
    }
    if (index !== 0) {
      await settleVisualCapture(page);
      await recordVisualCapture(
        `studio-account-${index === 1 ? "security" : index === 2 ? "identities" : "settings"}-${viewport.width}x${viewport.height}-${climate}.png`,
        await screenshot(page),
      );
    }
  }
}
