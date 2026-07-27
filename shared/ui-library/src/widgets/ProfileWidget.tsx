// @ts-ignore TS6133 - h is required for JSX compilation
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { h } from "preact";
import type { VNode } from "preact";
import { z } from "@brains/utils/zod";
import type { BaseWidgetProps } from "./types";
import { WidgetCard } from "./WidgetCard";

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
    return <WidgetCard title="Anchor Profile" empty="No profile data" />;
  }

  const { name, description, links } = parsed.data;

  return (
    <WidgetCard title="Anchor Profile">
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
    </WidgetCard>
  );
}
