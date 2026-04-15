import type { JSX } from "preact";
import type { QuickstartContent } from "./schema";
import { Badge, Section } from "@brains/site-rizom";

export const QuickstartLayout = ({
  badge,
  headline,
  description,
  installCommand,
  createCommand,
  runCommand,
  okLines,
}: QuickstartContent): JSX.Element => {
  return (
    <Section id="quickstart" className="reveal py-section">
      <div className="flex flex-col md:flex-row gap-8 md:gap-20 items-start">
        <div className="w-full md:w-[420px] shrink-0">
          <Badge>{badge}</Badge>
          <h2 className="font-display text-[28px] md:text-[36px] tracking-[-0.5px] leading-[1.2] mt-4">
            {headline}
          </h2>
          <p className="text-body-xs md:text-body-sm text-theme-muted mt-4">
            {description}
          </p>
        </div>
        <div className="flex-1 w-full bg-[var(--color-surface-terminal)] border border-[var(--color-surface-terminal-border)] rounded-[10px] md:rounded-xl p-5 md:p-8 font-mono text-label-sm md:text-body-xs overflow-x-auto">
          <div className="text-theme-light text-label-sm mb-1">Install</div>
          <div className="text-accent mb-4 break-all md:break-normal">
            {installCommand}
          </div>
          <div className="text-theme-light text-label-sm mb-1">Create</div>
          <div className="text-accent mb-4 break-all md:break-normal">
            {createCommand}
          </div>
          <div className="text-theme-light text-label-sm mb-1">Run</div>
          <div className="text-accent mb-4 break-all md:break-normal">
            {runCommand}
          </div>
          <div className="h-px bg-white/[0.06] my-4" />
          {okLines.map((line) => (
            <div
              key={line}
              className="text-[var(--color-success)] text-label-sm md:text-body-xs"
            >
              {line}
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
};
