// @ts-ignore TS6133 - h is required for JSX compilation
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { h } from "preact";
import type { VNode } from "preact";
import { z } from "@brains/utils/zod";
import type { BaseWidgetProps } from "./types";
import { WidgetCard } from "./WidgetCard";

const characterDataSchema = z.object({
  name: z.string(),
  role: z.string(),
  purpose: z.string(),
  values: z.array(z.string()),
});

export type IdentityWidgetProps = BaseWidgetProps;

export function IdentityWidget({ data }: IdentityWidgetProps): VNode {
  const parsed = characterDataSchema.safeParse(data);

  if (!parsed.success) {
    return <WidgetCard title="Brain Character" empty="No character data" />;
  }

  const { name, role, purpose, values } = parsed.data;

  return (
    <WidgetCard title="Brain Character">
      <div className="text-base font-semibold text-heading mb-1">{name}</div>
      <div className="text-sm text-heading mb-1">{role}</div>
      <p className="text-xs text-theme-muted leading-relaxed mb-3">{purpose}</p>
      <div className="flex flex-wrap gap-1">
        {values.map((v) => (
          <span
            key={v}
            className="text-[0.625rem] font-medium px-1.5 py-0.5 rounded bg-status-info text-status-info"
          >
            {v}
          </span>
        ))}
      </div>
    </WidgetCard>
  );
}
