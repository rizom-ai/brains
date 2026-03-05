// @ts-ignore TS6133 - h is required for JSX compilation
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { h } from "preact";
import type { VNode } from "preact";
import { z } from "@brains/utils";
import type { BaseWidgetProps } from "./index";

const profileDataSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  links: z.array(z.object({ label: z.string(), url: z.string() })).optional(),
});

const PLATFORM_LABELS: Record<string, string> = {
  github: "GitHub",
  linkedin: "LinkedIn",
  instagram: "Instagram",
  email: "Email",
  website: "Website",
};

export type ProfileWidgetProps = BaseWidgetProps;

export function ProfileWidget({ data }: ProfileWidgetProps): VNode {
  const parsed = profileDataSchema.safeParse(data);

  if (!parsed.success) {
    return (
      <div className="bg-theme-subtle border border-theme rounded-[10px] p-5">
        <div className="text-xs font-semibold uppercase tracking-wider text-theme-muted mb-3">
          Anchor Profile
        </div>
        <p className="text-sm text-theme-muted">No profile data</p>
      </div>
    );
  }

  const { name, description, links } = parsed.data;

  return (
    <div className="bg-theme-subtle border border-theme rounded-[10px] p-5">
      <div className="text-xs font-semibold uppercase tracking-wider text-theme-muted mb-3">
        Anchor Profile
      </div>
      <div className="text-sm font-semibold text-heading mb-1">{name}</div>
      {description && (
        <p className="text-xs text-theme-muted leading-relaxed">
          {description}
        </p>
      )}
      {links && links.length > 0 && (
        <dl className="mt-4">
          {links.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex justify-between items-baseline gap-2 py-2 border-t border-theme text-xs no-underline group"
            >
              <span className="text-theme-muted shrink-0">
                {PLATFORM_LABELS[link.label] ?? link.label}
              </span>
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
