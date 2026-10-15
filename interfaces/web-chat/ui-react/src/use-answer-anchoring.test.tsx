/** @jsxImportSource react */
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Window } from "happy-dom";
import { act, useRef, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ChatHistoryMessage } from "@brains/contracts/chat";
import { installDomGlobals, type RestoreGlobals } from "@brains/test-utils";
import { useAnswerAnchoring } from "./use-answer-anchoring";

let restoreGlobals: RestoreGlobals;
let windowInstance: Window;
let container: HTMLElement;
let root: Root;
const showFrom = mock((_element: HTMLElement): void => undefined);

beforeEach(() => {
  windowInstance = new Window({ url: "https://brain.test/" });
  restoreGlobals = installDomGlobals(windowInstance);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  showFrom.mockClear();
});

afterEach(async () => {
  await act(async (): Promise<void> => root.unmount());
  const prototype = windowInstance.HTMLDivElement.prototype;
  Reflect.deleteProperty(prototype, "scrollHeight");
  Reflect.deleteProperty(prototype, "clientHeight");
  await windowInstance.happyDOM.abort();
  windowInstance.close();
  restoreGlobals();
});

function Probe(props: { messages: ChatHistoryMessage[] }): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  useAnswerAnchoring({ ref, showFrom }, props.messages);
  return (
    <div ref={ref} className="region">
      {props.messages.map((message) => (
        <section key={message.id} className={`guest-${message.role}`}>
          {message.content}
        </section>
      ))}
    </div>
  );
}

async function render(messages: ChatHistoryMessage[]): Promise<void> {
  await act(async (): Promise<void> => {
    root.render(<Probe messages={messages} />);
  });
}

/** happy-dom has no layout: say how tall each region's content is. */
function regionHolds(scrollHeight: number): void {
  const prototype = windowInstance.HTMLDivElement.prototype;
  Object.defineProperty(prototype, "scrollHeight", {
    configurable: true,
    value: scrollHeight,
  });
  Object.defineProperty(prototype, "clientHeight", {
    configurable: true,
    value: 500,
  });
}

const first: ChatHistoryMessage = {
  id: "q1",
  role: "user",
  content: "What is public?",
};
const firstAnswer: ChatHistoryMessage = {
  id: "a1",
  role: "assistant",
  content: "This is public.",
};
const second: ChatHistoryMessage = {
  id: "q2",
  role: "user",
  content: "And what is not?",
};
const secondAnswer: ChatHistoryMessage = {
  id: "a2",
  role: "assistant",
  content: "Everything else.",
};

function asked(content: string): HTMLElement | undefined {
  return [...container.querySelectorAll<HTMLElement>(".guest-user")].find(
    (element) => element.textContent === content,
  );
}

describe("useAnswerAnchoring", () => {
  it("opens an arriving answer at the question it answers", async () => {
    await render([first, firstAnswer, second]);
    regionHolds(1600);
    await render([first, firstAnswer, second, secondAnswer]);
    expect(showFrom).toHaveBeenCalledTimes(1);
    expect(showFrom.mock.calls[0]?.[0]).toBe(asked(second.content));
  });

  it("leaves a region that does not scroll to its page", async () => {
    await render([first]);
    regionHolds(500);
    await render([first, firstAnswer]);
    expect(showFrom).not.toHaveBeenCalled();
  });

  it("leaves a conversation that opens with its answers already there", async () => {
    regionHolds(1600);
    await render([first, firstAnswer]);
    expect(showFrom).not.toHaveBeenCalled();
  });

  it("anchors only an answer that follows a question, once", async () => {
    await render([first, firstAnswer]);
    regionHolds(1600);
    await render([first, firstAnswer, second]);
    await render([first, firstAnswer, second, secondAnswer]);
    await render([first, firstAnswer, second, { ...secondAnswer }]);
    expect(showFrom).toHaveBeenCalledTimes(1);
  });
});
