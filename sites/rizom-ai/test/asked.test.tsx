/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import { Asked, askedSchema } from "../src/asked";

// "Asked before": visitors' questions the owner kept, most asked first, each
// opening on its answer, who answered, and the sources in their owners' words.
// The drawing lights from the kept sources; no count is ever shown.
const faqs = [
  {
    id: "how-do-brains-hand-work-over",
    question: "How do brains hand work over?",
    answer: "Each keeps its own memory. **Becca's** keeps the handoffs.",
    asked: 23,
    sources: [
      {
        id: "network-piece:plc-peer--post--3kabc",
        title: "Handoffs between teams",
        url: "https://becca.rizom.ai/essays/handoffs",
        excerpt: "Before anyone leaves a task we write three things down.",
        brain: { name: "Becca", url: "https://becca.rizom.ai/" },
      },
      {
        id: "post:what-a-brain-is",
        title: "What a brain is",
        url: "https://rizom.ai/essays/what-a-brain-is",
        excerpt: null,
        brain: null,
      },
    ],
  },
  {
    id: "what-is-a-brain",
    question: "What is a brain?",
    answer: "A memory that answers.",
    asked: 4,
    sources: [],
  },
];

const map = {
  center: { kind: "identity" },
  nodes: [
    {
      id: "becca.rizom.ai",
      name: "Becca",
      kind: "person",
      status: "approved",
      tags: [],
      distance: 0.58,
      bearing: 120,
    },
    {
      id: "jo.rizom.ai",
      name: "Jo",
      kind: "person",
      status: "approved",
      tags: [],
      distance: 0.48,
      bearing: 300,
    },
  ],
  clusters: [],
  sightings: [],
  distanceRange: { min: 0.48, max: 0.58 },
  pendingCount: 0,
};

function render(): InstanceType<typeof Window>["document"] {
  const html = renderToStaticMarkup(
    <Asked {...askedSchema.parse({ ...map, faqs })} />,
  );
  const window = new Window();
  window.document.body.innerHTML = html;
  return window.document;
}

describe("the Asked-before chapter", () => {
  test("is a chapter that lights the network, one closed question at a time", () => {
    const document = render();
    const section = document.querySelector("section#asked");
    expect(section?.classList.contains("chapter")).toBe(true);
    expect(section?.hasAttribute("data-lights-network")).toBe(true);
    expect(section?.querySelector(".eyebrow")?.textContent).toBe(
      "Asked before",
    );
    const questions = Array.from(document.querySelectorAll("details"));
    expect(
      questions.map((d) => d.querySelector("summary")?.textContent),
    ).toEqual(["How do brains hand work over?", "What is a brain?"]);
    expect(questions.every((d) => d.getAttribute("name") === "asked")).toBe(
      true,
    );
    expect(questions.some((d) => d.hasAttribute("open"))).toBe(false);
    expect(document.body.textContent).not.toContain("23");
  });

  test("carries each answer's kept sources for the drawing, and shows them in their owners' words", () => {
    const document = render();
    const [first, second] = Array.from(document.querySelectorAll("details"));
    expect(JSON.parse(first?.getAttribute("data-ask-answer") ?? "[]")).toEqual([
      {
        id: "network-piece:plc-peer--post--3kabc",
        title: "Handoffs between teams",
        brain: { name: "Becca", url: "https://becca.rizom.ai/" },
      },
      { id: "post:what-a-brain-is", title: "What a brain is" },
    ]);
    expect(first?.querySelector(".asked__by")?.textContent).toBe(
      "Rizom, with Becca",
    );
    const row = first?.querySelector(
      '[data-ask-source="network-piece:plc-peer--post--3kabc"]',
    );
    expect(row?.getAttribute("data-ask-brain")).toBe("Becca");
    expect(row?.querySelector("a")?.getAttribute("href")).toBe(
      "https://becca.rizom.ai/essays/handoffs",
    );
    expect(row?.querySelector("q")?.textContent).toBe(
      "Before anyone leaves a task we write three things down.",
    );
    expect(first?.querySelector("strong")?.textContent).toBe("Becca's");
    expect(second?.getAttribute("data-ask-answer")).toBe("[]");
    expect(second?.querySelector(".asked__by")).toBe(null);
  });

  test("draws the live network beside the questions, keyed by brain", () => {
    const document = render();
    const marks = Array.from(
      document.querySelectorAll("#asked .net-layer .net-mark[data-brain]"),
    ).map((mark) => mark.getAttribute("data-brain"));
    expect(marks.sort()).toEqual(["becca.rizom.ai", "jo.rizom.ai"]);
  });

  test("renders nothing until the owner has published a question", () => {
    expect(
      renderToStaticMarkup(
        <Asked {...askedSchema.parse({ ...map, faqs: [] })} />,
      ),
    ).toBe("");
  });
});
