// @ts-ignore TS6133 - h is required for JSX compilation
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { h } from "preact";
import type { VNode } from "preact";
import { z } from "@brains/utils";
import type { BaseWidgetProps } from "./index";

const identityDataSchema = z.object({
  name: z.string(),
  tagline: z.string().optional(),
  owner: z.string().optional(),
  anchor: z.string().optional(),
  character: z
    .object({
      role: z.string(),
      purpose: z.string(),
      values: z.array(z.string()),
    })
    .optional(),
  links: z.array(z.object({ label: z.string(), url: z.string() })).optional(),
  system: z.record(z.string()).optional(),
});

export type IdentityWidgetProps = BaseWidgetProps;

function SectionTitle({ children }: { children: string }): VNode {
  return (
    <div className="text-xs font-semibold uppercase tracking-wider text-theme-muted mb-3">
      {children}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }): VNode {
  return (
    <div className="flex justify-between py-2 border-t border-theme text-xs">
      <span className="text-theme-muted">{label}</span>
      <span className="text-theme font-medium">{value}</span>
    </div>
  );
}

export function IdentityWidget({ data }: IdentityWidgetProps): VNode {
  const parsed = identityDataSchema.safeParse(data);

  if (!parsed.success) {
    return (
      <div className="bg-theme-subtle border border-theme rounded-[10px] p-5">
        <SectionTitle>Identity</SectionTitle>
        <p className="text-sm text-theme-muted">No identity data</p>
      </div>
    );
  }

  const { name, tagline, owner, anchor, character, links, system } =
    parsed.data;

  return (
    <div className="bg-theme-subtle border border-theme rounded-[10px] p-5">
      {/* Identity section */}
      <SectionTitle>Identity</SectionTitle>
      <div className="text-base font-semibold text-heading mb-1">{name}</div>
      {tagline && (
        <p className="text-xs text-theme-muted leading-relaxed mb-4">
          {tagline}
        </p>
      )}
      <dl>
        {owner && <DetailRow label="Owner" value={owner} />}
        {anchor && <DetailRow label="Anchor" value={anchor} />}
      </dl>

      {/* Character section */}
      {character && (
        <div className="mt-5">
          <SectionTitle>Character</SectionTitle>
          <div className="text-sm font-semibold text-heading mb-1">
            {character.role}
          </div>
          <p className="text-xs text-theme-muted leading-relaxed mb-3">
            {character.purpose}
          </p>
          <div className="flex flex-wrap gap-1">
            {character.values.map((v) => (
              <span
                key={v}
                className="text-[0.625rem] font-medium px-1.5 py-0.5 rounded bg-status-info text-status-info"
              >
                {v}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Links section */}
      {links && links.length > 0 && (
        <div className="mt-5">
          <SectionTitle>Links</SectionTitle>
          <dl>
            {links.map((link) => (
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
        </div>
      )}

      {/* System info */}
      {system && Object.keys(system).length > 0 && (
        <dl className="mt-4">
          {Object.entries(system).map(([key, value]) => (
            <DetailRow key={key} label={key} value={value} />
          ))}
        </dl>
      )}
    </div>
  );
}
