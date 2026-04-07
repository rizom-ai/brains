import type { JSX } from "preact";
import { Section } from "../../components/Section";
import { Badge } from "../../components/Badge";

interface FeatureRow {
  icon: string;
  title: string;
  body: string;
}

const ROWS: FeatureRow[] = [
  {
    icon: "M",
    title: "Markdown, not databases",
    body: "Every entity — posts, notes, links, decks — lives as a markdown file with frontmatter. Version-controlled with git. Readable without the brain running.",
  },
  {
    icon: "S",
    title: "Self-hosted, open source",
    body: "Deploy to your own server with one command. Or run locally. Apache-2.0 licensed. No vendor lock-in, no subscriptions, no fine print.",
  },
  {
    icon: "A",
    title: "AI model agnostic",
    body: "Not tied to any single provider. Swap models, combine them, or bring your own. Works with the best AI available today and adapts tomorrow.",
  },
];

export const OwnershipLayout = (): JSX.Element => {
  return (
    <Section id="ownership" className="reveal py-section">
      <div className="flex flex-col md:flex-row gap-9 md:gap-20 items-start">
        <div className="w-full md:w-[45%]">
          <Badge>Your Data, Your Rules</Badge>
          <h2 className="font-display text-[28px] tracking-[-1px] leading-[1.1] md:text-display-md mt-4 md:mt-6">
            Everything is a plain text file you can read with any editor
          </h2>
        </div>
        <div className="w-full md:w-[55%] flex flex-col gap-8 md:pt-[60px]">
          {ROWS.map((row, i) => (
            <div
              key={row.icon}
              className={`reveal reveal-delay-${i + 1} flex gap-4 md:gap-5 items-start`}
            >
              <div className="shrink-0 min-w-[44px] md:min-w-[48px] h-11 md:h-12 flex items-center justify-center border border-accent rounded-lg font-nav text-[18px] md:text-heading-md font-bold text-accent">
                {row.icon}
              </div>
              <div>
                <div className="font-nav text-heading-sm md:text-heading-md font-bold mb-1.5">
                  {row.title}
                </div>
                <p className="text-body-xs md:text-body-sm text-theme-muted">
                  {row.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
};
