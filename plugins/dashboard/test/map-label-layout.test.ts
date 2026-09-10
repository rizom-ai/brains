import { expect, test } from "bun:test";
import { layoutMapLabels } from "../src/render/map-label-layout";

test("keeps fitting map labels, counts and authored positions", () => {
  const labels = layoutMapLabels(
    [
      {
        id: "exact:topic/id",
        label: "Ecosystem architecture",
        count: 0,
        x: 300,
        y: 40,
      },
    ],
    820,
    480,
  );
  expect(labels.size).toBe(1);
  const label = labels.get("exact:topic/id");
  if (!label) throw Error("Missing label");
  expect(label.text).toBe("Ecosystem architecture");
  expect(label.fullText).toBe("Ecosystem architecture");
  expect(label.x).toBe(300);
  expect(label.y).toBe(40);
});

test("budgets the displayed uppercase form without changing source text", () => {
  const fullText = "ß".repeat(40);
  const label = layoutMapLabels(
    [{ id: "case", label: fullText, count: 2, x: 300, y: 40 }],
    820,
    480,
  ).get("case");
  if (!label) throw Error("Missing case-sensitive source label");
  expect(label.fullText).toBe(fullText);
  expect(label.text.toUpperCase().length).toBeLessThanOrEqual(23);
  expect(label.text.endsWith("…")).toBe(true);
});

test("bounds dense labels without cutting graphemes or losing exact source text", () => {
  const source = Array.from({ length: 7 }, (_, index) => ({
    id: `topic:${index}`,
    label: `${"👩🏽‍💻é🇳🇱".repeat(20)} exact ${index}`,
    count: index,
    x: index % 2 === 0 ? 60 : 110,
    y: 24,
  }));
  const labels = layoutMapLabels(source, 820, 480);
  expect(labels.size).toBe(7);
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  for (const item of source) {
    const label = labels.get(item.id);
    if (!label) throw Error("Missing source label");
    expect(label.fullText).toBe(item.label);
    expect(label.text.endsWith("…")).toBe(true);
    const visible = Array.from(
      segmenter.segment(label.text.slice(0, -1)),
      (part) => part.segment,
    );
    const original = Array.from(
      segmenter.segment(item.label),
      (part) => part.segment,
    );
    expect(visible).toEqual(original.slice(0, visible.length));
    expect(label.x - label.width / 2).toBeGreaterThanOrEqual(12);
    expect(label.x + label.width / 2).toBeLessThanOrEqual(808);
    expect(label.y).toBeGreaterThanOrEqual(16);
    expect(label.y).toBeLessThanOrEqual(468);
    for (const [otherId, other] of labels) {
      if (item.id === otherId) continue;
      expect(
        Math.abs(label.x - other.x) >= (label.width + other.width) / 2 + 12 ||
          Math.abs(label.y - other.y) >= 18,
      ).toBe(true);
    }
  }
});
