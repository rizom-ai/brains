/** @jsxImportSource preact */
import type { JSX } from "preact";
import type { SiteSectionGroup } from "@rizom/site";
import { defineSection, sectionGroup, z } from "@rizom/site-sections";
import { Section } from "@rizom/site-rizom";
import { SectCap, Trio, trioSchema } from "./shared";

/**
 * The /brain room — the product's own page. The consolidated homepage grew
 * two pages long because it told the umbrella story and the product story at
 * once; the product story now lives here, in the "brain" namespace, so each
 * section stores as site-content/brain/<section>.md and resolves as
 * "brain:<section>".
 *
 * Phase 1 re-homes the two pure-product sections unchanged (your-data,
 * quickstart); the four-chapter product narrative (capture / ask / see-it-run
 * / connect) lands in a later phase.
 */

/* ============ your data, your rules ============ */

function BrainYourDataSection({
  cap,
  items,
}: z.infer<typeof trioSchema>): JSX.Element {
  return (
    <Section id="your-data" className="py-14">
      <SectCap lead={cap} />
      <Trio items={items} mono={true} />
    </Section>
  );
}

/* ============ quickstart ============ */

const termLineSchema = z.object({
  kind: z.enum(["comment", "command", "ok"]),
  text: z.string(),
});

const quickstartSchema = z.object({
  cap: z.string(),
  capNote: z.string(),
  lines: z.array(termLineSchema),
  checks: z.array(z.string()),
});

type TermLine = z.infer<typeof termLineSchema>;

function termLineClass(kind: TermLine["kind"]): string {
  switch (kind) {
    case "comment":
      return "text-theme-light opacity-70";
    case "ok":
      return "text-secondary";
    case "command":
      return "text-theme";
  }
}

function BrainQuickstartSection({
  cap,
  capNote,
  lines,
  checks,
}: z.infer<typeof quickstartSchema>): JSX.Element {
  return (
    <Section id="quickstart" className="py-14">
      <SectCap lead={cap} trail={capNote} />
      <div className="mt-7 grid max-w-[1000px] items-start gap-12 md:grid-cols-[1.15fr_1fr]">
        <div className="reveal reveal-delay-1 border border-theme bg-theme-subtle/60 px-6 py-5 font-label text-[14px] leading-[1.9]">
          {lines.map((line, i) => (
            <div key={i} className={termLineClass(line.kind)}>
              {line.kind === "command" && (
                <span className="select-none text-accent">$ </span>
              )}
              {line.text}
            </div>
          ))}
        </div>
        <ul className="reveal reveal-delay-2 font-body text-[15.5px] text-theme-light">
          {checks.map((check) => (
            <li
              key={check}
              className="flex gap-2.5 border-b border-theme-light py-[7px]"
            >
              <span aria-hidden="true" className="font-label text-secondary">
                ✓
              </span>
              {check}
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

/* ============ the brain section group ============ */

/**
 * The product room, in order. The namespace ("brain") matches the route id.
 */
export const brainSections: SiteSectionGroup = sectionGroup("brain", {
  "your-data": defineSection(trioSchema, BrainYourDataSection, {
    title: "Your Data",
    description: "Your data, your rules — ownership trio (mono markers)",
  }),
  quickstart: defineSection(quickstartSchema, BrainQuickstartSection, {
    title: "Quickstart",
    description: "Three-command quickstart terminal with a checklist",
  }),
});
