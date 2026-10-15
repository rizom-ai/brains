import {
  activateWorkspaceTab,
  clickSelector,
  clickText,
  elementDisplay,
  ESCAPE_KEY,
  evaluatePage,
  evaluatePageWith,
  fillLabel,
  pointerDownSelector,
  pressKey,
  TAB_KEY,
  waitForPage,
  waitForSelector,
  waitForText,
  waitForVisualStability,
} from "./page";

export async function verifyAdministrationRecords(
  page: Bun.WebView,
  surface: string,
): Promise<void> {
  const label =
    surface === "studio-administration"
      ? "View protection"
      : surface === "studio-administration-invitations"
        ? "Review"
        : "Details";
  await waitForSelector(
    page,
    '.declarative-detail-master [data-record-trailing="true"]',
  );
  await clickText(
    page,
    '.declarative-detail-master [data-record-trailing="true"] button',
    label,
  );
  await waitForSelector(page, ".declarative-detail-pane h2");
  const inspection = await evaluatePage(page, () => {
    const pane = document.querySelector(".declarative-detail-pane");
    return {
      selected: new URL(location.href).searchParams.has("selected"),
      text: pane?.textContent ?? "",
      unsafeAnchorControl: Array.from(
        pane?.querySelectorAll("button") ?? [],
      ).some(
        (button) =>
          /^(Change role|Suspend person)$/.test(button.textContent.trim()) &&
          !button.disabled,
      ),
    };
  });
  if (!inspection.selected)
    throw new Error(
      "Administration selection did not enter canonical query state",
    );
  if (
    surface === "studio-administration" &&
    (!inspection.text.includes("must remain an active Admin") ||
      !inspection.text.includes("cannot be suspended") ||
      inspection.unsafeAnchorControl)
  )
    throw new Error("Anchor inspection lost its protection");
  if (
    surface === "studio-administration-invitations" &&
    !inspection.text.includes("Confirm delivered")
  )
    throw new Error("Invitation review lost its manual delivery control");
  if ((await elementDisplay(page, ".declarative-detail-back")) !== "none") {
    await clickText(page, ".declarative-detail-back", "Back");
  } else {
    // Query edits replace the current URL; desktop inspection returns through
    // the local tabs rather than pretending browser Back closes the pane.
    const next = surface === "studio-administration" ? "Invitations" : "People";
    await activateWorkspaceTab(page, next);
    await waitForPage("Administration local tab transition", () =>
      evaluatePageWith(
        page,
        (label) =>
          document
            .querySelector('[role="tab"][aria-selected="true"]')
            ?.textContent.trim() === label &&
          !document.querySelector(".declarative-detail-pane"),
        next,
      ),
    );
    await activateWorkspaceTab(
      page,
      surface === "studio-administration"
        ? "People"
        : surface === "studio-administration-invitations"
          ? "Invitations"
          : "Access activity",
    );
  }
  await waitForPage("Administration collection after closing inspection", () =>
    evaluatePage(
      page,
      () =>
        !!document.querySelector(".declarative-detail-master") &&
        !document.querySelector(".declarative-detail-pane"),
    ),
  );
}

export async function verifyRecordTypography(page: Bun.WebView): Promise<void> {
  const failures = await evaluatePage(page, () => {
    const errors: string[] = [];
    const root = getComputedStyle(document.documentElement);
    const normalize = (value: string): string => value.replace(/["'\s]/g, "");
    for (const list of document.querySelectorAll<HTMLElement>(
      ".operator-list[data-presentation]",
    )) {
      const role = list.dataset["presentation"];
      const size =
        role === "editorial"
          ? 20
          : role === "attention"
            ? 18
            : role === "activity"
              ? 14
              : 16;
      const family = normalize(
        root.getPropertyValue(
          role === "editorial" ? "--console-display" : "--console-ui",
        ),
      );
      for (const title of list.querySelectorAll<HTMLElement>(
        ":scope > li > div:first-child > strong",
      )) {
        const style = getComputedStyle(title);
        if (
          style.fontSize !== `${size}px` ||
          normalize(style.fontFamily) !== family
        )
          errors.push(`${role}: ${style.fontSize} ${style.fontFamily}`);
        const link = title.querySelector("a,button");
        if (link && getComputedStyle(link).fontSize !== style.fontSize)
          errors.push(`${role}: linked title lost its typography`);
      }
    }
    return errors;
  });
  if (failures.length)
    throw new Error(`Record hierarchy mismatch: ${failures.join("; ")}`);
}

export async function verifyStudioMobileSwitcher(
  page: Bun.WebView,
): Promise<void> {
  const originalPath = await page.evaluate<string>("location.pathname");
  await clickSelector(page, ".studio-mobile-switcher");
  await waitForSelector(page, ".studio-mobile-navigation-sheet");
  const expanded = await page.evaluate<boolean>(
    'document.querySelector(".studio-mobile-switcher")?.getAttribute("aria-expanded") === "true"',
  );
  if (!expanded) throw new Error("Studio phone context picker did not open");
  const browseLayout = await evaluatePage(page, () => {
    const sheet = document.querySelector(".studio-mobile-navigation-sheet");
    const header = document.querySelector(".studio-chrome");
    if (!(sheet instanceof HTMLElement) || !(header instanceof HTMLElement))
      return false;
    const bounds = sheet.getBoundingClientRect();
    return (
      Math.abs(bounds.top - header.getBoundingClientRect().bottom) <= 1 &&
      Math.abs(bounds.bottom - window.innerHeight) <= 1 &&
      sheet.querySelectorAll("details").length === 3 &&
      !sheet.querySelector(".studio-mobile-navigation-dock") &&
      ["Overview", "Chat", "Administration"].every((label) =>
        Array.from(sheet.querySelectorAll("section button")).some(
          (button) => button.getAttribute("aria-label") === label,
        ),
      ) &&
      !Array.from(sheet.querySelectorAll("button")).some(
        (button) => button.textContent.trim() === "Account",
      )
    );
  });
  if (!browseLayout)
    throw new Error(
      "Browse no longer matches the approved direct destinations and independently collapsible groups",
    );
  await fillLabel(page, "Filter destinations", "agen");
  await waitForPage("Browse filter narrows every group", () =>
    evaluatePage(page, () => {
      const links = Array.from(
        document.querySelectorAll(".studio-mobile-navigation-link"),
      );
      return (
        links.length === 1 && links[0]?.textContent.includes("Agents") === true
      );
    }),
  );
  await fillLabel(page, "Filter destinations", "");
  await waitForPage("Browse filter clears", () =>
    evaluatePage(
      page,
      () =>
        document.querySelectorAll(".studio-mobile-navigation-link").length > 1,
    ),
  );
  await pressKey(page, ESCAPE_KEY);
  await waitForPage("Browse focus restoration", () =>
    page.evaluate<boolean>(
      'document.activeElement?.classList.contains("studio-mobile-switcher") === true',
    ),
  );
  await clickSelector(page, ".studio-mobile-switcher");
  await waitForSelector(page, ".studio-mobile-navigation-sheet");
  const libraryOpen = await page.evaluate<boolean>(
    'Array.from(document.querySelectorAll(".studio-mobile-navigation-group")).some(group => group.open && group.querySelector("summary")?.textContent.includes("Library"))',
  );
  if (!libraryOpen)
    await clickText(page, ".studio-mobile-navigation-group summary", "Library");
  await waitForPage("Library group rests open", () =>
    page.evaluate<boolean>(
      'Array.from(document.querySelectorAll("details")).some(group => group.open && group.querySelector("summary")?.textContent.includes("Library"))',
    ),
  );
  await clickText(page, ".studio-mobile-navigation-group summary", "Work");
  await waitForPage("independent Browse groups", () =>
    page.evaluate<boolean>(
      'document.querySelectorAll("details[open]").length >= 2',
    ),
  );
  await clickText(page, ".studio-mobile-navigation-group summary", "Library");
  await waitForPage("explicit group folding", () =>
    page.evaluate<boolean>(
      'Array.from(document.querySelectorAll("details")).some(group => !group.open && group.querySelector("summary")?.textContent.includes("Library"))',
    ),
  );
  await clickText(page, ".studio-mobile-navigation-group summary", "Library");
  if ((await page.evaluate<string>("location.pathname")) !== originalPath)
    throw new Error("Browse groups changed the working destination");
  await clickText(page, ".studio-mobile-navigation-link", "Field notes");
  await waitForPage("Studio phone context navigation", () =>
    page.evaluate<boolean>('location.pathname === "/studio/entities/posts"'),
  );
  await evaluatePage(page, () => history.back());
  await waitForPage("Studio phone context return", () =>
    page.evaluate<boolean>(
      `location.pathname === ${JSON.stringify(originalPath)}`,
    ),
  );
}

export async function verifyDirectStudioNavigation(
  page: Bun.WebView,
  surface: string,
  width: number,
): Promise<void> {
  const expected =
    surface === "studio-chat"
      ? "Chat"
      : surface === "studio-administration"
        ? "Administration"
        : "Account";
  const state = await evaluatePage(page, () => ({
    labels: Array.from(
      document.querySelectorAll(".studio-area-link [data-area-label]"),
    ).map((node) => node.getAttribute("data-area-label")),
    current:
      document
        .querySelector('.studio-area-link[aria-pressed="true"]')
        ?.getAttribute("aria-label") ?? null,
    location: document
      .querySelector(".studio-chrome-location")
      ?.textContent.trim(),
    leaf: document.querySelector(".studio-leaf-rail") !== null,
    mainWidth: Math.round(
      document
        .querySelector(
          "[data-studio-body] > :not(aside), .studio-chat-workspace",
        )
        ?.getBoundingClientRect().width ?? 0,
    ),
    viewportWidth: document.documentElement.clientWidth,
    width: Math.round(
      document.querySelector(".rail")?.getBoundingClientRect().width ?? 0,
    ),
  }));
  if (
    state.labels.join("/") !== "Overview/Chat/Library/Work/Admin/System" ||
    state.current !== (expected === "Account" ? null : expected) ||
    state.location !== expected ||
    state.leaf ||
    (width > 900 && state.width !== 124) ||
    (width <= 900 && Math.abs(state.mainWidth - state.viewportWidth) > 1)
  )
    throw new Error(`Direct destination layout: ${JSON.stringify(state)}`);
  if (width > 900) {
    await clickSelector(page, ".studio-navigation-collapse");
    await waitForPage("direct collapsed width", () =>
      page.evaluate<boolean>(
        'Math.round(document.querySelector(".rail").getBoundingClientRect().width) === 68',
      ),
    );
    await clickSelector(page, ".studio-navigation-collapse");
    await waitForPage("direct expanded width", () =>
      page.evaluate<boolean>(
        'Math.round(document.querySelector(".rail").getBoundingClientRect().width) === 124',
      ),
    );
  }
}

export async function verifyStudioProfileNavigation(
  page: Bun.WebView,
  surface: string,
): Promise<void> {
  const originalUrl = await page.evaluate<string>("location.href");
  await evaluatePage(page, () => {
    document.body.dataset["navigationProbe"] = "same-document";
  });
  if (surface === "studio-account") {
    await fillLabel(page, "Display name", "Unsaved profile name");
    await pointerDownSelector(page, ".studio-chrome-identity");
    await waitForSelector(page, '[role="menuitem"]');
    await clickText(page, '[role="menuitem"]', "Account");
    const preserved = await evaluatePage(
      page,
      () =>
        document.body.dataset["navigationProbe"] === "same-document" &&
        Array.from(document.querySelectorAll("input")).some(
          (input) => input.value === "Unsaved profile name",
        ),
    );
    if (
      !preserved ||
      (await page.evaluate<string>("location.href")) !== originalUrl
    )
      throw new Error("Same-page Account navigation reset profile edits");
    return;
  }
  await evaluatePage(page, () => {
    const input = document.querySelector('textarea[aria-label="Message"]');
    if (!(input instanceof HTMLTextAreaElement))
      throw new Error("Missing composer");
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set?.call(input, "Keep this navigation draft");
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
  });
  await pointerDownSelector(page, ".studio-chrome-identity");
  await waitForSelector(page, '[role="menuitem"]');
  await clickText(page, '[role="menuitem"]', "Account");
  await waitForText(page, "Leave this conversation?");
  await clickText(
    page,
    '[role="dialog"] button, [role="alertdialog"] button',
    "Stay",
  );
  if ((await page.evaluate<string>("location.href")) !== originalUrl)
    throw new Error("Profile navigation ignored the Chat guard");
  await pointerDownSelector(page, ".studio-chrome-identity");
  await waitForSelector(page, '[role="menuitem"]');
  await clickText(page, '[role="menuitem"]', "Account");
  await waitForText(page, "Leave this conversation?");
  await clickText(
    page,
    '[role="dialog"] button, [role="alertdialog"] button',
    "Leave",
  );
  await waitForText(page, "Signed-in sessions");
  if (
    !(await page.evaluate<boolean>(
      'document.body.dataset.navigationProbe === "same-document"',
    ))
  )
    throw new Error(
      "Profile navigation reloaded the document instead of using the guarded router",
    );
  await evaluatePage(page, () => history.back());
  await waitForSelector(page, 'textarea[aria-label="Message"]');
  if (
    !(await page.evaluate<boolean>(
      'document.querySelector("textarea").value === "Keep this navigation draft"',
    )) ||
    (await page.evaluate<string>("location.href")) !== originalUrl
  )
    throw new Error("Profile navigation lost the session route or Chat draft");
  await evaluatePage(page, () => {
    const input = document.querySelector('textarea[aria-label="Message"]');
    if (!(input instanceof HTMLTextAreaElement))
      throw new Error("Missing composer");
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set?.call(input, "");
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
  });
}

async function verifyStudioDialogKeyboard(page: Bun.WebView): Promise<void> {
  const ready = await evaluatePage(page, () => {
    const dialog = [
      ...document.querySelectorAll<HTMLElement>(
        '[role="dialog"], [role="alertdialog"]',
      ),
    ].find((node) => node.getBoundingClientRect().height > 0);
    if (!dialog) return false;
    const controls = [
      ...dialog.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, summary, a[href], [tabindex], [contenteditable="true"]',
      ),
    ].filter((node) => {
      const closed = node.closest("details:not([open])");
      return (
        !node.matches(":disabled") &&
        node.tabIndex >= 0 &&
        node.getBoundingClientRect().height > 0 &&
        getComputedStyle(node).visibility !== "hidden" &&
        (!closed || closed.querySelector(":scope > summary")?.contains(node))
      );
    });
    const first = controls[0],
      last = controls.at(-1);
    if (!first || !last)
      throw new Error("Dialog has no keyboard-reachable controls");
    first.dataset["studioAuditFirst"] = "";
    last.dataset["studioAuditLast"] = "";
    const previous =
      document.activeElement instanceof HTMLElement &&
      dialog.contains(document.activeElement)
        ? document.activeElement
        : first;
    previous.dataset["studioAuditReturn"] = "";
    last.focus();
    if (document.activeElement !== last)
      throw new Error("Last dialog control could not receive focus");
    return true;
  });
  if (!ready) return;
  for (const [modifiers, expected] of [
    [0, "first"],
    [8, "last"],
  ] as const) {
    await pressKey(page, { ...TAB_KEY, modifiers });
    await evaluatePageWith(
      page,
      (edge) => {
        if (
          document.activeElement !==
          document.querySelector(`[data-studio-audit-${edge}]`)
        )
          throw new Error(
            `Dialog focus did not wrap to ${edge} control: active=${document.activeElement?.outerHTML.slice(0, 350)} expected=${document.querySelector(`[data-studio-audit-${edge}]`)?.outerHTML.slice(0, 350)}`,
          );
      },
      expected,
    );
  }
  await evaluatePage(page, () => {
    document.querySelector<HTMLElement>("[data-studio-audit-return]")?.focus();
    for (const edge of ["first", "last", "return"])
      document
        .querySelector(`[data-studio-audit-${edge}]`)
        ?.removeAttribute(`data-studio-audit-${edge}`);
  });
}

interface StudioScrollAudit {
  left: number;
  top: number;
  regions: Array<{ node: HTMLElement; left: number; top: number }>;
}

export async function verifyStudioKeyboardAccess(
  page: Bun.WebView,
): Promise<void> {
  await evaluatePage(page, () => {
    const host = globalThis as unknown as {
      __studioScrollAudit?: StudioScrollAudit;
    };
    host.__studioScrollAudit = {
      left: window.scrollX,
      top: window.scrollY,
      regions: [...document.querySelectorAll<HTMLElement>("*")]
        .filter(
          (node) =>
            node.scrollHeight > node.clientHeight ||
            node.scrollWidth > node.clientWidth,
        )
        .map((node) => ({ node, left: node.scrollLeft, top: node.scrollTop })),
    };
  });
  try {
    await verifyStudioDialogKeyboard(page);
    const ready = await evaluatePage(page, () => {
      if (
        [
          ...document.querySelectorAll<HTMLElement>(
            '[role="dialog"], [role="alertdialog"], [role="menu"]',
          ),
        ].some((node) => node.getBoundingClientRect().height > 0)
      )
        return false;
      const skip = document.querySelector<HTMLButtonElement>(
        ".studio-skip-content",
      );
      if (!skip) return false;
      skip.focus();
      if (skip.getBoundingClientRect().top < 0)
        throw new Error("Skip control is not visible on focus");
      return true;
    });
    if (!ready) return;
    await pressKey(page, {
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
      text: "\r",
    });
    await evaluatePage(page, () => {
      const active = document.activeElement;
      if (
        !(active instanceof HTMLElement) ||
        !active.matches('main, [role="main"]') ||
        active.id === "root" ||
        active.querySelector(".studio-chrome")
      )
        throw new Error(
          `Skip to content did not focus the main landmark: ${active?.outerHTML.slice(0, 240)}`,
        );
    });
    await pressKey(page, TAB_KEY);
    await evaluatePage(page, () => {
      const main = document.querySelector(
        '[data-studio-shell] main, [data-studio-shell] [role="main"]',
      );
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || !main?.contains(active))
        throw new Error("Tab after skipping content returned to navigation");
      const chrome = document
        .querySelector(".studio-chrome")
        ?.getBoundingClientRect();
      if (chrome && active.getBoundingClientRect().top < chrome.bottom - 1)
        throw new Error("Content focus is obscured by Studio chrome");
      active.blur();
    });
    const previous = await evaluatePage(page, () => {
      const thread = document.querySelector<HTMLElement>(
        ".studio-chat-thread-scroll",
      );
      if (
        !thread ||
        thread.scrollTop <= 0 ||
        thread.getBoundingClientRect().height === 0
      )
        return null;
      thread.focus();
      return {
        top: thread.scrollTop,
        atLatest:
          thread.scrollHeight - thread.clientHeight - thread.scrollTop <= 48,
      };
    });
    if (previous !== null) {
      await pressKey(page, {
        key: "PageUp",
        code: "PageUp",
        windowsVirtualKeyCode: 33,
      });
      await waitForPage("keyboard conversation scrolling", () =>
        evaluatePageWith(
          page,
          (top) =>
            (document.querySelector(".studio-chat-thread-scroll")?.scrollTop ??
              top) < top,
          previous.top,
        ),
      );
      await waitForVisualStability(page);
      await evaluatePageWith(
        page,
        (position) => {
          const thread = document.querySelector<HTMLElement>(
            ".studio-chat-thread-scroll",
          );
          if (thread) {
            if (position.atLatest)
              [...document.querySelectorAll("button")]
                .find((button) => button.textContent.includes("Jump to latest"))
                ?.click();
            thread.scrollTo({
              top: position.atLatest ? thread.scrollHeight : position.top,
              behavior: "instant",
            });
            thread.blur();
          }
        },
        previous,
      );
    }
  } finally {
    // Keyboard focus can scroll the document, workspace, or editor independently.
    await evaluatePage(page, () => {
      const host = globalThis as unknown as {
        __studioScrollAudit?: StudioScrollAudit;
      };
      const snapshot = host.__studioScrollAudit;
      if (!snapshot) return;
      for (const { node, left, top } of snapshot.regions)
        if (node.isConnected) node.scrollTo({ left, top, behavior: "instant" });
      window.scrollTo({
        left: snapshot.left,
        top: snapshot.top,
        behavior: "instant",
      });
      delete host.__studioScrollAudit;
    });
  }
}

export async function verifyDisabledPrimaries(
  page: Bun.WebView,
): Promise<void> {
  const check = async (): Promise<{ x: number; y: number } | undefined> =>
    evaluatePage(page, () => {
      let point: { x: number; y: number } | undefined;
      for (const button of document.querySelectorAll<HTMLButtonElement>(
        'button[data-slot="button"]:is([data-variant="default"], [data-variant="primary"]):disabled',
      )) {
        const reference = document.createElement("span");
        reference.style.cssText =
          "display:none;background-color:var(--console-card-soft);color:var(--console-text-muted);border:1px solid var(--console-rule-strong)";
        button.append(reference);
        const expected = getComputedStyle(reference),
          actual = getComputedStyle(button);
        const neutral =
          actual.backgroundColor === expected.backgroundColor &&
          actual.color === expected.color &&
          actual.borderTopColor === expected.borderTopColor &&
          actual.opacity === "1" &&
          actual.transform === "none";
        reference.remove();
        if (!neutral)
          throw Error(
            `Disabled primary must stay neutral, including on hover: ${button.getAttribute("aria-label") ?? button.textContent}`,
          );
        const rect = button.getBoundingClientRect();
        if (
          rect.width > 0 &&
          rect.height > 0 &&
          rect.top >= 0 &&
          rect.bottom <= innerHeight &&
          rect.left >= 0 &&
          rect.right <= innerWidth
        )
          point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      }
      return point;
    });
  const point = await check();
  if (point) {
    await page.cdp("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      ...point,
    });
    await waitForVisualStability(page);
    await check();
    await page.cdp("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: 0,
      y: 0,
    });
  }
}

export async function verifyCollectionFiltersFit(
  page: Bun.WebView,
): Promise<void> {
  await evaluatePage(page, () => {
    const panel = document.querySelector<HTMLElement>(
      ".studio-collection-controls details[open] > div",
    );
    if (!panel) throw Error("Missing open collection filters");
    const bounds = panel.getBoundingClientRect();
    if (bounds.width <= 0 || panel.scrollWidth > panel.clientWidth + 1)
      throw Error("Collection filters overflow their panel");
    for (const field of panel.querySelectorAll("select, input")) {
      const rect = field.getBoundingClientRect();
      if (
        rect.width <= 0 ||
        rect.left < bounds.left - 1 ||
        rect.right > bounds.right + 1 ||
        rect.right > innerWidth
      )
        throw Error("Collection filter control is clipped");
    }
    panel.querySelector<HTMLSelectElement>("select")?.focus();
  });
  await pressKey(page, ESCAPE_KEY);
  await evaluatePage(page, () => {
    const details = document.querySelector<HTMLDetailsElement>(
      ".studio-collection-controls details",
    );
    if (
      !details ||
      details.open ||
      document.activeElement !== details.querySelector("summary")
    )
      throw Error(
        "Escape must close only the filters and restore their trigger",
      );
  });
  await clickText(page, ".studio-collection-controls summary", "Filter");
}

export async function verifyNativeDateFits(page: Bun.WebView): Promise<void> {
  // The input's own scrollWidth does not expose clipped native date segments.
  // Inspect Chromium's user-agent shadow layout instead of guessing its locale.
  interface NativeNode {
    nodeId: number;
    nodeName: string;
    attributes?: string[];
    children?: NativeNode[];
    shadowRoots?: NativeNode[];
  }
  const tree = await page.cdp<{ root: NativeNode }>("DOM.getDocument", {
    depth: -1,
    pierce: true,
  });
  function nodes(node: NativeNode): NativeNode[] {
    return [
      node,
      ...[...(node.children ?? []), ...(node.shadowRoots ?? [])].flatMap(nodes),
    ];
  }
  const input = nodes(tree.root).find(
    (node) =>
      node.nodeName === "INPUT" && node.attributes?.includes("datetime-local"),
  );
  if (!input) throw Error("Missing native date input");
  const shadow = nodes(input);
  const edit = shadow.find((node) =>
    node.attributes?.includes("-webkit-datetime-edit"),
  );
  const fields = shadow.find((node) =>
    node.attributes?.includes("-webkit-datetime-edit-fields-wrapper"),
  );
  if (!edit || !fields) throw Error("Native date layout is unavailable");
  const box = await page.cdp<{ model: { content: number[] } }>(
    "DOM.getBoxModel",
    { nodeId: edit.nodeId },
  );
  const text = await page.cdp<{ model: { content: number[] } }>(
    "DOM.getBoxModel",
    { nodeId: fields.nodeId },
  );
  const left = box.model.content[0],
    right = box.model.content[2],
    textLeft = text.model.content[0],
    textRight = text.model.content[2];
  if (
    left === undefined ||
    right === undefined ||
    textLeft === undefined ||
    textRight === undefined ||
    textLeft < left - 1 ||
    textRight > right + 1
  )
    throw Error(
      `Native date/time segments are clipped: ${JSON.stringify({ left, right, textLeft, textRight })}`,
    );
}
