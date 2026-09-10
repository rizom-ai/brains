interface LabelSource {
  id: string;
  label: string;
  count: number;
  x: number;
  y: number;
}
export interface MapLabelPlacement {
  x: number;
  y: number;
  text: string;
  fullText: string;
  width: number;
  height: number;
}

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const ADVANCE = 6.8; // Conservative 10px mono glyph plus tracking, including phone labels.
const HEIGHT = 16;
const GAP = 12;
const EDGE = 12;

function units(text: string): number {
  return Array.from(segmenter.segment(text.toUpperCase())).reduce(
    (total, part) =>
      total + ((part.segment.codePointAt(0) ?? 0) > 0xff ? 2 : 1),
    0,
  );
}

function compactLabel(label: string, budget: number): string {
  const parts = Array.from(segmenter.segment(label), (part) => part.segment);
  const total = parts.reduce((sum, part) => sum + units(part), 0);
  if (total <= budget) return label;
  let text = "",
    used = 0;
  for (const part of parts) {
    if (used + units(part) > Math.max(0, budget - 2)) break;
    text += part;
    used += units(part);
  }
  return text.trimEnd() + "…";
}

/** Only label placement changes: map nodes, contours, counts, and identifiers remain host-owned. */
export function layoutMapLabels(
  items: readonly LabelSource[],
  width: number,
  height: number,
): ReadonlyMap<string, MapLabelPlacement> {
  const placed = new Map<string, MapLabelPlacement>();
  for (const item of items) {
    const reserve = (String(item.count).length + 1) * ADVANCE + 6;
    const maximum = Math.min(180, width - EDGE * 2);
    const text = compactLabel(
      item.label,
      Math.floor((maximum - reserve) / ADVANCE),
    );
    const textUnits = Array.from(segmenter.segment(text)).reduce(
      (sum, part) => sum + units(part.segment),
      0,
    );
    const boxWidth = Math.min(maximum, textUnits * ADVANCE + reserve);
    const x = Math.max(
      EDGE + boxWidth / 2,
      Math.min(width - EDGE - boxWidth / 2, item.x),
    );
    const candidates = [
      item.y,
      ...Array.from(
        { length: 12 },
        (_, index) =>
          item.y + (index % 2 === 0 ? -1 : 1) * Math.ceil((index + 1) / 2) * 18,
      ),
      ...Array.from(
        { length: Math.ceil(height / 18) },
        (_, index) => 16 + index * 18,
      ),
    ];
    for (const candidate of candidates) {
      const y = Math.max(16, Math.min(height - EDGE, candidate));
      if (
        [...placed.values()].some(
          (other) =>
            Math.abs(x - other.x) < (boxWidth + other.width) / 2 + GAP &&
            Math.abs(y - other.y) < HEIGHT + 2,
        )
      )
        continue;
      placed.set(item.id, {
        x,
        y,
        text,
        fullText: item.label,
        width: boxWidth,
        height: HEIGHT,
      });
      break;
    }
  }
  return placed;
}
