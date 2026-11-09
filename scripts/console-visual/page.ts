/**
 * Browser-page helpers for the console visual harness.
 *
 * Every callback handed to `evaluatePage`, `evaluatePageWith`, or
 * `runPageChecks` is serialized with `Function.prototype.toString` and run in
 * the page, so it may reference only browser globals and its own argument —
 * never an import or anything else in module scope.
 */
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";
import {
  DeadlineError,
  PAGE_CALL_DEADLINE_MS,
  withDeadline,
} from "./case-deadline";

interface BrowserNetworkEvent {
  requestId: string;
}

/** A page script as a stalled-call error names it: one line, 160 characters at most. */
export function scriptExcerpt(script: string): string {
  const line = script.replace(/\s+/g, " ").trim();
  return line.length <= 160 ? line : `${line.slice(0, 159)}…`;
}

/**
 * Settles with `work`, one call to the page. A call still pending after `ms`
 * fails naming itself and what `liveness` finds then: a page that still
 * answers and draws frames is waiting on something that will not happen; a
 * page that no longer answers has a renderer that died or hung.
 */
export async function boundPageCall<T>(
  work: Promise<T>,
  call: string,
  liveness: () => Promise<string>,
  ms = PAGE_CALL_DEADLINE_MS,
): Promise<T> {
  try {
    return await withDeadline(work, ms, call);
  } catch (error) {
    if (!(error instanceof DeadlineError)) throw error;
    throw new Error(`${error.message}; ${await liveness()}`, { cause: error });
  }
}

/** Whether the page's answer to a trivial evaluation, `state`, arrives within `ms`. */
export async function describeLiveness(
  state: Promise<string>,
  ms = 5_000,
): Promise<string> {
  try {
    return `the page still answers: ${await withDeadline(state, ms, "liveness probe")}`;
  } catch (error) {
    return `the page does not answer an evaluation either: ${getErrorMessage(error)}`;
  }
}

const PAGE_STATE_SCRIPT = `new Promise((resolve) => {
  let frames = 0;
  let sampling = true;
  const tick = () => {
    if (!sampling) return;
    frames++;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  setTimeout(() => {
    sampling = false;
    resolve(frames + " animation frames in 500ms, " + document.visibilityState);
  }, 500);
})`;

const runtimeStringResult = z.object({
  result: z.object({ value: z.string() }),
});

/**
 * How many frames the page draws in half a second, asked on the channel the
 * stalled call leaves free: `Bun.WebView` allows one pending evaluation and
 * one pending CDP command per page.
 */
async function pageState(
  page: Bun.WebView,
  via: "cdp" | "evaluate",
): Promise<string> {
  if (via === "evaluate") return page.evaluate<string>(PAGE_STATE_SCRIPT);
  const answer = await page.cdp("Runtime.evaluate", {
    expression: PAGE_STATE_SCRIPT,
    returnByValue: true,
    awaitPromise: true,
  });
  return runtimeStringResult.parse(answer).result.value;
}

/** The liveness check a stalled call on `page` reports, asked `via` the free channel. */
export function livenessProbe(
  page: Bun.WebView,
  via: "cdp" | "evaluate",
): () => Promise<string> {
  return () => describeLiveness(pageState(page, via));
}

/**
 * A capture page whose navigations, evaluations, and CDP commands each fail
 * after `PAGE_CALL_DEADLINE_MS`, naming the call and the page's liveness.
 * `Bun.WebView` bounds none of them: an awaited page promise that never
 * settles, or a command Chrome never answers, would otherwise hold its case
 * until the case deadline names only the case.
 */
export class BoundedWebView extends Bun.WebView {
  override navigate(url: string): Promise<void> {
    return boundPageCall(
      super.navigate(url),
      `navigate ${url}`,
      livenessProbe(this, "evaluate"),
    );
  }

  override evaluate<T = unknown>(script: string): Promise<T> {
    return boundPageCall(
      super.evaluate<T>(script),
      `evaluate ${scriptExcerpt(script)}`,
      livenessProbe(this, "cdp"),
    );
  }

  override cdp<T = unknown>(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    return boundPageCall(
      super.cdp<T>(method, params),
      `cdp ${method}`,
      livenessProbe(this, "evaluate"),
    );
  }
}

export interface ElementBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function evaluatePage<T>(
  page: Bun.WebView,
  operation: () => T | Promise<T>,
): Promise<Awaited<T>> {
  return page.evaluate<Awaited<T>>(`(${operation.toString()})()`);
}

export async function evaluatePageWith<TArg, TResult>(
  page: Bun.WebView,
  operation: (arg: TArg) => TResult | Promise<TResult>,
  arg: TArg,
): Promise<Awaited<TResult>> {
  const serialized = JSON.stringify(arg);
  return page.evaluate<Awaited<TResult>>(
    `(${operation.toString()})(${serialized})`,
  );
}

/**
 * Runs named page checks in order within one synchronous evaluation, so no
 * browser task (an event, a frame) runs between them. Checks hand values to
 * later checks through the shared `state`, which starts empty.
 */
export async function runPageChecks<TState extends object>(
  page: Bun.WebView,
  checks: ReadonlyArray<(state: TState) => void>,
): Promise<void> {
  const calls = checks.map((check) => `(${check.toString()})(state);`);
  await page.evaluate(`((state) => {\n${calls.join("\n")}\n})({})`);
}

export async function waitForPage(
  description: string,
  probe: () => Promise<boolean>,
  timeoutMs = 30_000,
): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (await probe()) return;
    await Bun.sleep(20);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

export async function waitForSelector(
  page: Bun.WebView,
  selector: string,
): Promise<void> {
  await waitForPage(selector, () =>
    page.evaluate<boolean>(
      `document.querySelector(${JSON.stringify(selector)}) !== null`,
    ),
  );
}

export async function waitForText(
  page: Bun.WebView,
  text: string,
): Promise<void> {
  await waitForPage(`text ${JSON.stringify(text)}`, () =>
    page.evaluate<boolean>(
      `document.body?.textContent?.includes(${JSON.stringify(text)}) ?? false`,
    ),
  );
}

export async function clickSelector(
  page: Bun.WebView,
  selector: string,
): Promise<void> {
  await waitForSelector(page, selector);
  const clicked = await evaluatePageWith(
    page,
    (candidateSelector) => {
      const candidate = document.querySelector(candidateSelector);
      if (!(candidate instanceof HTMLElement)) return false;
      candidate.click();
      return true;
    },
    selector,
  );
  if (!clicked) throw new Error(`Could not click ${selector}`);
}

export async function pointerDownSelector(
  page: Bun.WebView,
  selector: string,
): Promise<void> {
  await waitForSelector(page, selector);
  const dispatched = await evaluatePageWith(
    page,
    (candidateSelector) => {
      const candidate = document.querySelector(candidateSelector);
      if (!(candidate instanceof HTMLElement)) return false;
      candidate.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          button: 0,
          pointerType: "mouse",
        }),
      );
      return true;
    },
    selector,
  );
  if (!dispatched) throw new Error(`Could not press ${selector}`);
}

export async function clickText(
  page: Bun.WebView,
  selector: string,
  text: string,
): Promise<void> {
  const clicked = await evaluatePageWith(
    page,
    ({ selector: candidateSelector, text: candidateText }) => {
      const candidate = Array.from(
        document.querySelectorAll<HTMLElement>(candidateSelector),
      ).find((element) => element.textContent.trim().includes(candidateText));
      candidate?.click();
      return candidate !== undefined;
    },
    { selector, text },
  );
  if (!clicked)
    throw new Error(`Could not find ${selector} containing ${text}`);
}

export async function activateWorkspaceTab(
  page: Bun.WebView,
  label: string,
): Promise<void> {
  const position = await evaluatePageWith(
    page,
    (text) => {
      const tab = Array.from(
        document.querySelectorAll<HTMLElement>('[role="tab"]'),
      ).find((node) => node.textContent.trim() === text);
      if (!tab) return null;
      const rect = tab.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    },
    label,
  );
  if (!position) throw new Error(`Missing workspace tab: ${label}`);
  await page.cdp("Input.dispatchMouseEvent", {
    type: "mousePressed",
    ...position,
    button: "left",
    clickCount: 1,
  });
  await page.cdp("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    ...position,
    button: "left",
    clickCount: 1,
  });
}

export interface KeyStroke {
  key: string;
  code: string;
  windowsVirtualKeyCode: number;
  modifiers?: number;
  /** Text the key down inserts, sent as both `text` and `unmodifiedText`. */
  text?: string;
}

export const ESCAPE_KEY = {
  key: "Escape",
  code: "Escape",
  windowsVirtualKeyCode: 27,
} satisfies KeyStroke;
export const TAB_KEY = {
  key: "Tab",
  code: "Tab",
  windowsVirtualKeyCode: 9,
} satisfies KeyStroke;

/** Presses and releases one key through the browser's input pipeline. */
export async function pressKey(
  page: Bun.WebView,
  { text, ...stroke }: KeyStroke,
): Promise<void> {
  await page.cdp("Input.dispatchKeyEvent", {
    type: "keyDown",
    ...stroke,
    ...(text === undefined ? {} : { text, unmodifiedText: text }),
  });
  await page.cdp("Input.dispatchKeyEvent", { type: "keyUp", ...stroke });
}

export async function fillLabel(
  page: Bun.WebView,
  labelText: string,
  value: string,
): Promise<void> {
  const filled = await evaluatePageWith(
    page,
    ({ labelText: text, value: nextValue }) => {
      // Fields that carry their own label expose it as aria-label rather than
      // spending a line on it, so match either.
      const labelled = Array.from(
        document.querySelectorAll<HTMLElement>(
          "input[aria-label], textarea[aria-label]",
        ),
      ).find(
        (candidate) =>
          candidate.getAttribute("aria-label") === text &&
          candidate.getBoundingClientRect().height > 0,
      );
      const label = Array.from(document.querySelectorAll("label")).find(
        (candidate) =>
          candidate.textContent.includes(text) &&
          candidate.getBoundingClientRect().height > 0,
      );
      const input =
        labelled ??
        (label?.htmlFor
          ? document.getElementById(label.htmlFor)
          : label?.querySelector("input, textarea"));
      if (!(
        input instanceof HTMLInputElement ||
        input instanceof HTMLTextAreaElement
      )) {
        return false;
      }
      const prototype =
        input instanceof HTMLInputElement
          ? HTMLInputElement.prototype
          : HTMLTextAreaElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(
        input,
        nextValue,
      );
      input.dispatchEvent(new InputEvent("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    },
    { labelText, value },
  );
  if (!filled) throw new Error(`Could not fill field labelled ${labelText}`);
}

export async function blurLabel(
  page: Bun.WebView,
  labelText: string,
): Promise<void> {
  const blurred = await evaluatePageWith(
    page,
    (text) => {
      const label = Array.from(document.querySelectorAll("label")).find(
        (candidate) => candidate.textContent.includes(text),
      );
      const input = label?.htmlFor
        ? document.getElementById(label.htmlFor)
        : label?.querySelector("input, textarea");
      if (!(input instanceof HTMLElement)) return false;
      input.blur();
      return true;
    },
    labelText,
  );
  if (!blurred) throw new Error(`Could not blur field labelled ${labelText}`);
}

export async function elementDisplay(
  page: Bun.WebView,
  selector: string,
): Promise<string> {
  return page.evaluate<string>(
    `(() => { const element = document.querySelector(${JSON.stringify(selector)}); return element ? getComputedStyle(element).display : "missing"; })()`,
  );
}

export async function elementBounds(
  page: Bun.WebView,
  selector: string,
): Promise<ElementBounds | undefined> {
  return evaluatePageWith(
    page,
    (candidateSelector) => {
      const element = document.querySelector(candidateSelector);
      if (!(element instanceof HTMLElement)) return undefined;
      const bounds = element.getBoundingClientRect();
      return {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      };
    },
    selector,
  );
}

function networkRequestFromEvent(
  event: Event,
): BrowserNetworkEvent | undefined {
  if (!("data" in event)) return undefined;
  const data = event.data;
  if (
    typeof data !== "object" ||
    data === null ||
    !("requestId" in data) ||
    typeof data.requestId !== "string"
  ) {
    return undefined;
  }
  return { requestId: data.requestId };
}

export async function navigateToNetworkIdle(
  page: Bun.WebView,
  url: string,
): Promise<void> {
  const activeRequests = new Set<string>();
  let lastActivity = performance.now();
  await page.cdp("Network.enable");
  page.addEventListener("Network.requestWillBeSent", (event: Event) => {
    const request = networkRequestFromEvent(event);
    if (!request) return;
    activeRequests.add(request.requestId);
    lastActivity = performance.now();
  });
  const finish = (event: Event): void => {
    const request = networkRequestFromEvent(event);
    if (!request) return;
    activeRequests.delete(request.requestId);
    lastActivity = performance.now();
  };
  page.addEventListener("Network.loadingFinished", finish);
  page.addEventListener("Network.loadingFailed", finish);
  await page.navigate(url);
  await waitForPage(`network idle for ${url}`, () =>
    Promise.resolve(
      activeRequests.size === 0 && performance.now() - lastActivity >= 500,
    ),
  );
}

export async function waitForVisualStability(page: Bun.WebView): Promise<void> {
  await evaluatePage(
    page,
    () =>
      new Promise<void>((resolve) => {
        let previous = "";
        let stableFrames = 0;
        let sampledFrames = 0;
        const sample = (): void => {
          const positions = [
            window.scrollX,
            window.scrollY,
            ...Array.from(document.querySelectorAll<HTMLElement>("*"))
              .filter(
                (element) =>
                  element.scrollHeight > element.clientHeight + 1 ||
                  element.scrollWidth > element.clientWidth + 1,
              )
              .flatMap((element) => [element.scrollLeft, element.scrollTop]),
          ];
          const current = JSON.stringify(positions);
          stableFrames = current === previous ? stableFrames + 1 : 0;
          previous = current;
          sampledFrames++;
          if (stableFrames >= 4 || sampledFrames >= 180) {
            resolve();
            return;
          }
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      }),
  );
}

/**
 * Focus `selector` as a keyboard user would and require its focus ring: a
 * capture of a focus state that never matched `:focus-visible` shows nothing.
 */
export async function focusSelector(
  page: Bun.WebView,
  selector: string,
): Promise<void> {
  await waitForSelector(page, selector);
  const visible = await evaluatePageWith(
    page,
    (candidateSelector) => {
      const candidate = document.querySelector(candidateSelector);
      if (!(candidate instanceof HTMLElement)) return false;
      candidate.focus({ focusVisible: true });
      return candidate.matches(":focus-visible");
    },
    selector,
  );
  if (!visible) throw new Error(`${selector} did not show a focus ring`);
}
