// @ts-ignore TS6133 - h is required for JSX compilation
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { h } from "preact";
import type { VNode } from "preact";
import { z } from "@brains/utils";
import type { BaseWidgetProps } from "./index";

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
    return (
      <div className="bg-theme-subtle border border-theme rounded-[10px] p-5">
        <div className="text-xs font-semibold uppercase tracking-wider text-theme-muted mb-3">
          Brain Character
        </div>
        <p className="text-sm text-theme-muted">No character data</p>
      </div>
    );
  }

  const { name, role, purpose, values } = parsed.data;

  return (
    <div className="bg-theme-subtle border border-theme rounded-[10px] p-5">
      <div className="text-xs font-semibold uppercase tracking-wider text-theme-muted mb-3">
        Brain Character
      </div>
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
    </div>
  );
}
