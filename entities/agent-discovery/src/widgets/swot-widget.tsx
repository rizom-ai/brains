/** @jsxImportSource preact */
import { z } from "@brains/utils";
import type { JSX } from "preact";

const swotItemSchema = z.object({
  title: z.string(),
  detail: z.string().optional(),
});

const swotWidgetDataSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("generating"),
  }),
  z.object({
    status: z.literal("ready"),
    strengths: z.array(swotItemSchema).default([]),
    weaknesses: z.array(swotItemSchema).default([]),
    opportunities: z.array(swotItemSchema).default([]),
    threats: z.array(swotItemSchema).default([]),
    derivedAt: z.string(),
  }),
]);

function SwotList({
  items,
}: {
  items: Array<z.infer<typeof swotItemSchema>>;
}): JSX.Element {
  if (items.length === 0) {
    return <p class="swot-empty">—</p>;
  }

  return (
    <ul class="swot-list">
      {items.map((item) => (
        <li key={`${item.title}:${item.detail ?? ""}`} class="swot-item">
          <b>{item.title}</b>
          {item.detail ? <span> — {item.detail}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function SwotCell({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "s" | "w" | "o" | "t";
  items: Array<z.infer<typeof swotItemSchema>>;
}): JSX.Element {
  return (
    <section class={`swot-cell is-${tone}`}>
      <div class="swot-head">{title}</div>
      <SwotList items={items} />
    </section>
  );
}

export function SwotWidget({ data }: { data: unknown }): JSX.Element {
  const parsed = swotWidgetDataSchema.safeParse(data);

  if (!parsed.success || parsed.data.status === "generating") {
    return (
      <div data-swot-widget>
        <p class="muted">generating assessment…</p>
      </div>
    );
  }

  const swot = parsed.data;
  return (
    <div data-swot-widget>
      <div class="swot" role="grid" aria-label="SWOT analysis of agent network">
        <SwotCell title="Strengths" tone="s" items={swot.strengths} />
        <SwotCell title="Weaknesses" tone="w" items={swot.weaknesses} />
        <SwotCell title="Opportunities" tone="o" items={swot.opportunities} />
        <SwotCell title="Threats" tone="t" items={swot.threats} />
      </div>
    </div>
  );
}
