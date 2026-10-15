import { systemFixtures } from "../fixtures/studio-system";
import { STUDY_STATE } from "./options";
import {
  elementBounds,
  elementDisplay,
  evaluatePage,
  runPageChecks,
} from "./page";
import { isStudioAppShellSurface } from "./surfaces";

interface DocumentDimensions {
  clientWidth: number;
  clientHeight: number;
  scrollWidth: number;
  scrollHeight: number;
  rootOverflowY: string;
  bodyOverflowY: string;
}

/**
 * The layout contract every capture must meet before its screenshot: no
 * document overflow, then the phone chrome, scroll ownership, typography,
 * and workspace geometry each surface family promises.
 */
export async function checkLayout(
  page: Bun.WebView,
  surface: string,
  width: number,
  viewportHeight: number,
): Promise<void> {
  const dimensions = await evaluatePage(page, () => ({
    clientWidth: document.documentElement.clientWidth,
    clientHeight: document.documentElement.clientHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    rootOverflowY: getComputedStyle(document.documentElement).overflowY,
    bodyOverflowY: getComputedStyle(document.body).overflowY,
  }));
  if (dimensions.scrollWidth !== dimensions.clientWidth) {
    throw new Error(
      `${surface} at ${width}px has document overflow (${dimensions.scrollWidth} > ${dimensions.clientWidth})`,
    );
  }
  if (surface.startsWith("studio-") && width <= 640)
    await checkStudioPhoneChrome(page);
  if (
    surface.startsWith("studio-") &&
    !surface.startsWith("studio-chat") &&
    width <= 640
  )
    await checkStudioPhoneDocument(
      page,
      surface,
      width,
      viewportHeight,
      dimensions,
    );
  if (surface.startsWith("studio-"))
    await runPageChecks(page, [
      pageHeadingInsets,
      studioTypeRoles,
      hostedCardHeadings,
      tagPlaceholdersFit,
    ]);
  if (surface === "studio-overview") await checkOverviewNavigation(page);
  if (surface.startsWith("studio-chat"))
    await checkStudioChatLayout(page, width, viewportHeight);
  if (isStudioAppShellSurface(surface))
    await checkStudioEditorLayout(page, surface, width, viewportHeight);
}

async function checkStudioPhoneChrome(page: Bun.WebView): Promise<void> {
  const chrome = await elementBounds(page, ".studio > .studio-chrome");
  if (!chrome || chrome.height > 64) {
    throw new Error(`Studio header exceeded the phone chrome budget`);
  }
  const smallActions = await evaluatePage(page, () =>
    Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-record-trailing="true"] button[data-variant="link"]',
      ),
    )
      .filter((button) => {
        const bounds = button.getBoundingClientRect();
        const minimum =
          parseFloat(
            getComputedStyle(button).getPropertyValue("--console-touch"),
          ) || 40;
        return bounds.height > 0 && bounds.height < minimum;
      })
      .map((button) => button.textContent.trim()),
  );
  if (smallActions.length)
    throw new Error(
      `Text actions lost their phone touch targets: ${smallActions.join(", ")}`,
    );
}

/** Phone Studio surfaces other than Chat, which owns its own working room. */
async function checkStudioPhoneDocument(
  page: Bun.WebView,
  surface: string,
  width: number,
  viewportHeight: number,
  dimensions: DocumentDimensions,
): Promise<void> {
  const railDisplay = await elementDisplay(
    page,
    "[data-studio-shell] > [data-studio-body] > .rail",
  );
  if (railDisplay !== "none") {
    throw new Error(`Studio rendered a duplicate phone navigation rail`);
  }
  const hasOpenActionSheet =
    surface === "studio-administration-invitations-form" ||
    surface.startsWith("studio-navigation");
  await checkPhoneScrollOwnership(
    page,
    surface,
    viewportHeight,
    dimensions,
    hasOpenActionSheet,
  );
  await checkPhonePageHead(page, surface, width, dimensions);
  await checkPhoneContextPicker(page, hasOpenActionSheet);
  if (surface.startsWith("studio-administration")) {
    const records = await elementBounds(
      page,
      STUDY_STATE === "empty"
        ? ".declarative-detail-master"
        : ".declarative-detail-master .operator-record-list",
    );
    if (!records || records.width > width)
      throw new Error(
        "Administration must use bounded record lists, not reflowed tables",
      );
  }
}

/**
 * One phone scroll region, and the right one owns it. The editor is an app
 * shell — fixed pane switcher, pinned save bar — so it locks the document
 * and scrolls its panes. Reading surfaces are documents: locking them
 * would pin the mobile browser's collapsible URL bar open, costing more
 * viewport than the chrome budget ever saves, so the document scrolls and
 * nothing nested may scroll with it.
 */
async function checkPhoneScrollOwnership(
  page: Bun.WebView,
  surface: string,
  viewportHeight: number,
  dimensions: DocumentDimensions,
  hasOpenActionSheet: boolean,
): Promise<void> {
  const scrollRegions = await evaluatePage(page, () =>
    Array.from(document.querySelectorAll<HTMLElement>("*"))
      .filter((element) => {
        const overflowY = getComputedStyle(element).overflowY;
        return (
          (overflowY === "auto" || overflowY === "scroll") &&
          element.scrollHeight > element.clientHeight + 1
        );
      })
      .map((element) => element.className.toString().slice(0, 60)),
  );
  if (hasOpenActionSheet) {
    const dialog = await elementBounds(page, '[role="dialog"]');
    if (!dialog || dialog.y + dialog.height > viewportHeight + 1) {
      throw new Error(`Studio action sheet escaped the phone viewport`);
    }
  } else if (isStudioAppShellSurface(surface)) {
    if (
      dimensions.scrollHeight > dimensions.clientHeight + 1 &&
      dimensions.rootOverflowY !== "hidden" &&
      dimensions.bodyOverflowY !== "hidden"
    ) {
      throw new Error(
        `Studio editor created a second phone scroll region (${dimensions.scrollHeight} > ${dimensions.clientHeight})`,
      );
    }
  } else if (scrollRegions.length > 0) {
    throw new Error(
      `Studio nested a phone scroll region inside the document: ${JSON.stringify(scrollRegions)}`,
    );
  } else if (
    dimensions.rootOverflowY === "hidden" ||
    dimensions.bodyOverflowY === "hidden"
  ) {
    throw new Error(
      `Studio locked the phone document scroll on a reading surface`,
    );
  }
}

async function checkPhonePageHead(
  page: Bun.WebView,
  surface: string,
  width: number,
  dimensions: DocumentDimensions,
): Promise<void> {
  const head = await elementBounds(page, ".studio-page-head");
  if (!head || head.y > 132) {
    const chrome = await evaluatePage(page, () =>
      [
        ".console-strip",
        ".rail",
        ".studio-mobile-switcher",
        "[data-studio-body]",
        ".studio-workspace-frame",
        "[data-studio-library]",
        ".account-studio-pane",
      ].map((selector) => {
        const element = document.querySelector(selector);
        if (!(element instanceof HTMLElement)) return `${selector}: absent`;
        const bounds = element.getBoundingClientRect();
        return `${selector}: y=${Math.round(bounds.y)} h=${Math.round(bounds.height)} display=${getComputedStyle(element).display}`;
      }),
    );
    throw new Error(
      `Studio content starts too low at ${width}px (${head?.y ?? "missing"})\n  ${chrome.join("\n  ")}`,
    );
  }
  const expectsPrimaryAction =
    surface === "studio-library" ||
    surface.startsWith("studio-administration-invitations");
  if (expectsPrimaryAction) {
    const action = await elementBounds(page, ".studio-page-head-action");
    if (
      !action ||
      action.y < head.y - 1 ||
      action.y + action.height > head.y + head.height + 1 ||
      action.x < 11 ||
      action.x + action.width > dimensions.clientWidth - 11
    ) {
      throw new Error(
        `Studio primary action escaped the phone page head: ${JSON.stringify(action)}`,
      );
    }
  }
}

async function checkPhoneContextPicker(
  page: Bun.WebView,
  hasOpenActionSheet: boolean,
): Promise<void> {
  const switcherState = await evaluatePage(page, () => {
    const rail = document.querySelector(".rail");
    if (!(rail instanceof HTMLElement)) return undefined;
    if (getComputedStyle(rail).display === "none") {
      return { visible: false, overflow: false, focusReached: true };
    }
    const switcher = rail.querySelector(".studio-mobile-switcher");
    const desktopTypes = rail.querySelector(".types");
    if (!(switcher instanceof HTMLButtonElement)) {
      return { visible: true, overflow: false, focusReached: false };
    }
    switcher.focus();
    const focusReached = document.activeElement === switcher;
    switcher.blur();
    const railBounds = rail.getBoundingClientRect();
    const switcherBounds = switcher.getBoundingClientRect();
    return {
      visible: getComputedStyle(switcher).display !== "none",
      overflow: rail.scrollWidth > rail.clientWidth + 1,
      focusReached,
      desktopTypesHidden:
        desktopTypes instanceof HTMLElement &&
        getComputedStyle(desktopTypes).display === "none",
      height: railBounds.height,
      triggerWidth: switcherBounds.width,
      availableWidth: railBounds.width - 24,
    };
  });
  if (
    switcherState?.visible &&
    (switcherState.overflow ||
      switcherState.desktopTypesHidden !== true ||
      switcherState.height > 56 ||
      Math.abs(switcherState.triggerWidth - switcherState.availableWidth) > 1)
  ) {
    throw new Error(
      `Studio phone context picker exceeded its chrome budget: ${JSON.stringify(switcherState)}`,
    );
  }
  if (!hasOpenActionSheet && switcherState?.focusReached === false) {
    throw new Error(`Studio phone context picker was not keyboard reachable`);
  }
}

// Page checks: serialized into the page, so each is self-contained.

function pageHeadingInsets(): void {
  const head = document.querySelector<HTMLElement>("[data-studio-page-head]");
  const frame = head?.closest<HTMLElement>(
    "[data-studio-editor], [data-studio-library], .studio-workspace-frame, .studio-chat-workspace, .account-shell",
  );
  if (!head || !frame) return;
  const box = head.getBoundingClientRect();
  const parent = frame.getBoundingClientRect();
  const inset = innerWidth <= 640 ? 20 : 36;
  const left = box.left - parent.left - frame.clientLeft + frame.scrollLeft;
  const right = frame.clientWidth - left - box.width;
  const top = box.top - parent.top - frame.clientTop + frame.scrollTop;
  if (Math.abs(left - inset) > 1 || Math.abs(right - inset) > 1)
    throw new Error(
      `Page heading inset mismatch: ${left}/${right}, expected ${inset}`,
    );
  if (
    frame.firstElementChild?.contains(head) &&
    Math.abs(top - (innerWidth <= 640 ? 24 : 36)) > 1
  )
    throw new Error(`Page heading top inset mismatch: ${top}`);
  const title = head.querySelector("h1");
  if (
    !title ||
    getComputedStyle(title).fontSize !==
      (innerWidth <= 640 ? "29px" : "36px") ||
    getComputedStyle(title).fontWeight !== "600"
  )
    throw new Error("Page heading display scale diverged");
  const action = head.querySelector(".studio-page-head-action");
  if (action) {
    const control = action.getBoundingClientRect();
    const heading = title.getBoundingClientRect();
    if (
      control.left < heading.right - 1 ||
      control.top - heading.top > parseFloat(getComputedStyle(title).fontSize)
    )
      throw new Error(
        "Page action overlaps the title or falls below its first line",
      );
  }
  if (
    getComputedStyle(head).borderBottomWidth !== "2px" ||
    getComputedStyle(head).borderBottomColor !== getComputedStyle(title).color
  )
    throw new Error("Page heading divider diverged");
}

function studioTypeRoles(): void {
  const typeRoles = [
    {
      selector: ".people-detail-name, .studio-leaf-head h2",
      size: "24px",
      weight: "500",
      tracking: -0.48,
    },
    {
      selector:
        ".account-section-label h3, .studio-chat-sessions-title, .studio-chat-context-card-title, .studio-mobile-group-name",
      size: "14px",
      weight: "650",
    },
    {
      selector:
        '.studio-chrome-brand, .studio-area-title, .studio-leaf-label, .studio-mobile-switcher, [data-studio-editor] aside > div > h2, button[aria-label="Editor view"], [aria-label="Publication actions"] header, [aria-label="Publication actions"] b, [data-studio-shell] th',
      size: "10px",
      weight: "600",
      tracking: 1.2,
    },
  ];
  for (const role of typeRoles) {
    for (const element of document.querySelectorAll(role.selector)) {
      const font = getComputedStyle(element);
      if (
        font.fontSize !== role.size ||
        font.fontWeight !== role.weight ||
        (role.tracking !== undefined &&
          !(
            Math.abs(parseFloat(font.letterSpacing) - role.tracking) <= 0.01
          )) ||
        (role.size === "10px" && font.textTransform !== "uppercase")
      )
        throw new Error(
          `Studio type role diverged for ${element.textContent.trim()}: ${font.fontSize}/${font.fontWeight}/${font.letterSpacing}`,
        );
    }
  }
}

function hostedCardHeadings(): void {
  const shell = document.querySelector("[data-studio-shell]");
  const uiFamily = shell ? getComputedStyle(shell).fontFamily : undefined;
  const cardWeights: Record<string, string> = {
    "10px": "600",
    "14px": "650",
    "24px": "500",
    // Attention disclosures retain the shared control's separate callout role.
    "18px": "500",
  };
  for (const title of document.querySelectorAll(
    ".declarative-card > header > h2",
  )) {
    if (!title.parentElement) throw new Error("Missing card heading owner");
    const font = getComputedStyle(title);
    const owner = getComputedStyle(title.parentElement);
    const tracking =
      font.fontSize === "10px"
        ? 1.2
        : font.fontSize === "24px"
          ? -0.48
          : undefined;
    if (
      (font.fontSize === "14px" && font.fontFamily !== uiFamily) ||
      (tracking !== undefined &&
        !(Math.abs(parseFloat(font.letterSpacing) - tracking) <= 0.01)) ||
      font.fontWeight !== cardWeights[font.fontSize] ||
      font.fontSize !== owner.fontSize ||
      font.fontWeight !== owner.fontWeight ||
      font.fontFamily !== owner.fontFamily ||
      font.letterSpacing !== owner.letterSpacing
    )
      throw new Error(
        `Hosted card type role diverged: ${title.textContent}/${font.fontSize}/${font.fontWeight}`,
      );
  }
}

function tagPlaceholdersFit(): void {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) throw new Error("Cannot measure tag placeholders");
  for (const input of document.querySelectorAll<HTMLInputElement>(
    'input[placeholder="Add tag"]',
  )) {
    if (!input.getBoundingClientRect().width) continue;
    const font = getComputedStyle(input);
    context.font = `${font.fontWeight} ${font.fontSize} ${font.fontFamily}`;
    if (
      input.clientWidth -
        parseFloat(font.paddingLeft) -
        parseFloat(font.paddingRight) <
      context.measureText(input.placeholder).width + 2
    )
      throw new Error("Tag placeholder clips its label or caret");
  }
}

async function checkOverviewNavigation(page: Bun.WebView): Promise<void> {
  await evaluatePage(page, () => {
    const navigation =
      document.querySelector<HTMLElement>(".studio-navigation");
    if (
      navigation?.dataset["leafOpen"] !== "false" ||
      navigation.querySelector(".studio-leaf-rail")
    )
      throw new Error(
        "Overview must remain a direct destination without a leaf column",
      );
    if (
      innerWidth > 900 &&
      Math.abs(navigation.getBoundingClientRect().width - 124) > 1
    )
      throw new Error(
        "Overview navigation still reserves a duplicate leaf column",
      );
  });
}

async function checkStudioChatLayout(
  page: Bun.WebView,
  width: number,
  viewportHeight: number,
): Promise<void> {
  const destinations = await elementDisplay(
    page,
    ".studio-chat-session-picker-trigger",
  );
  const sessions = await elementDisplay(page, ".studio-chat-sessions");
  if (
    destinations === "missing" ||
    destinations === "none" ||
    sessions !== "missing"
  ) {
    throw new Error(`Studio Chat must keep history on demand at ${width}px`);
  }
  const workspace = await elementBounds(page, ".studio-chat-room");
  const composer = await elementBounds(page, ".studio-chat-composer");
  const transcript = await elementBounds(page, ".studio-chat-thread-scroll");
  if (!transcript || !workspace || transcript.height < workspace.height * 0.55)
    throw new Error("Conversation must dominate the workspace");
  await evaluatePage(page, () => {
    if (
      document.querySelector(".studio-chat-workspace > [data-studio-page-head]")
    )
      throw new Error("Chat duplicates its page header");
    const form = document.querySelector(".studio-chat-composer-form");
    if (
      !form ||
      getComputedStyle(form).borderTopWidth !== "1px" ||
      getComputedStyle(form).borderRadius !== "12px"
    )
      throw new Error(
        `Composer frame missing: ${form ? getComputedStyle(form).cssText + form.className + getComputedStyle(form).borderTop : "missing"}`,
      );
    if (
      document.querySelector(".studio-chat-thread-scroll .studio-chat-context")
    )
      throw new Error("Context must stay outside the dialogue");
  });
  if (!composer) {
    throw new Error(`Studio Chat workspace did not render at ${width}px`);
  }
  if (composer.y + composer.height > viewportHeight + 1) {
    throw new Error(
      `Studio Chat composer escaped the viewport at ${width}px: ${JSON.stringify({ composer, workspace, viewportHeight, root: await elementBounds(page, ".studio"), frame: await elementBounds(page, ".studio-chat-workspace") })}`,
    );
  }
  if (composer.y + composer.height > workspace.y + workspace.height + 1) {
    throw new Error(
      `Studio Chat composer escaped its working room at ${width}px`,
    );
  }
}

async function checkStudioEditorLayout(
  page: Bun.WebView,
  surface: string,
  width: number,
  viewportHeight: number,
): Promise<void> {
  const stacked = await evaluatePage(page, () => {
    const editor = document.querySelector("[data-studio-editor]");
    return editor?.getAttribute("data-editor-presentation") !== "split";
  });
  if (stacked) {
    if (await elementBounds(page, ".studio-mobile-tabs"))
      throw new Error("Stacked editors must not duplicate body navigation");
    // Compare against the usable scrollport, not its scrollbar-inclusive box.
    const contentWidth = await evaluatePage(
      page,
      () =>
        document.querySelector("[data-studio-editor-content]")?.clientWidth ??
        0,
    );
    const properties = await elementBounds(page, "[data-studio-properties]");
    const insets = width > 640 ? 72 : 40;
    if (
      !contentWidth ||
      !properties ||
      properties.width < contentWidth - insets - 2
    )
      throw new Error("System Properties must use the available editor width");
    if (
      (await elementDisplay(page, '[aria-label="Editor body view"]')) === "none"
    )
      throw new Error("Stacked body modes must remain available on phones");
  } else {
    const modes = await elementDisplay(page, ".studio-mobile-tabs");
    if (width <= 640 !== (modes !== "none"))
      throw new Error(`Studio responsive mode mismatch at ${width}px`);
  }
  if (width <= 900) {
    const pipeline = await elementBounds(page, "[data-studio-save-bar]");
    if (!pipeline || pipeline.y + pipeline.height > viewportHeight + 1)
      throw new Error(`Studio save bar escaped the viewport at ${width}px`);
    if (width <= 640) {
      const more = await elementBounds(
          page,
          'button[aria-label="More document actions"]',
        ),
        save = await elementBounds(page, ".studio-editor-head-save");
      const readOnlyProfile = systemFixtures.get(
        surface.slice("studio-system-".length),
      )?.readOnly;
      if (readOnlyProfile) {
        if (save) throw Error("Read-only profiles must not offer Save");
      } else if (!save || save.width < 44 || save.height < 44 || save.y > 220)
        throw Error("Phone Save must remain visible in the document head");
      if (
        more &&
        (pipeline.x + pipeline.width - (more.x + more.width) > 24 ||
          more.width < 44 ||
          more.height < 44)
      )
        throw Error(
          `Phone document actions must stay at the end of the save bar: ${JSON.stringify({ pipeline, more })}`,
        );
    }
  }
}
