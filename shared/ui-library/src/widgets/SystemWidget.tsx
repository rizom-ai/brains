// @ts-ignore TS6133 - h is required for JSX compilation
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { h } from "preact";
import type { VNode } from "preact";
import { z } from "@brains/utils";
import type { BaseWidgetProps } from "./index";

const systemDataSchema = z.object({
  version: z.string(),
  plugins: z.string(),
  rendered: z.string(),
  links: z.array(z.object({ label: z.string(), url: z.string() })).optional(),
});

export type SystemWidgetProps = BaseWidgetProps;

const SYSTEM_FIELDS: Array<{
  key: "version" | "plugins" | "rendered";
  label: string;
}> = [
  { key: "version", label: "Version" },
  { key: "plugins", label: "Plugins" },
  { key: "rendered", label: "Rendered" },
];

export function SystemWidget({ data }: SystemWidgetProps): VNode {
  const parsed = systemDataSchema.safeParse(data);

  if (!parsed.success) {
    return (
      <div className="bg-theme-subtle border border-theme rounded-[10px] p-5">
        <div className="text-xs font-semibold uppercase tracking-wider text-theme-muted mb-3">
          System
        </div>
        <p className="text-sm text-theme-muted">No system data</p>
      </div>
    );
  }

  const systemData = parsed.data;

  return (
    <div className="bg-theme-subtle border border-theme rounded-[10px] p-5">
      <div className="text-xs font-semibold uppercase tracking-wider text-theme-muted mb-3">
        System
      </div>
      <dl>
        {SYSTEM_FIELDS.map(({ key, label }) => (
          <div
            key={key}
            className="flex justify-between py-2 border-t border-theme text-xs"
          >
            <span className="text-theme-muted">{label}</span>
            <span className="text-theme font-medium">{systemData[key]}</span>
          </div>
        ))}
      </dl>
      {systemData.links && systemData.links.length > 0 && (
        <dl className="mt-3">
          {systemData.links.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex justify-between items-baseline gap-2 py-2 border-t border-theme text-xs no-underline group"
            >
              <span className="text-theme-muted shrink-0">{link.label}</span>
              <span className="font-mono text-[0.65rem] text-brand group-hover:text-accent underline underline-offset-2 break-all text-right">
                {link.url.replace(/^https?:\/\//, "")}
              </span>
            </a>
          ))}
        </dl>
      )}
    </div>
  );
}
