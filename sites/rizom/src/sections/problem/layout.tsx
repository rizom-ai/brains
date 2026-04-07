import type { JSX } from "preact";

interface ProblemCard {
  num: string;
  title: string;
  body: string;
}

const CARDS: ProblemCard[] = [
  {
    num: "01",
    title: "Your best thinking never ships",
    body: "You have notes, drafts, and ideas scattered everywhere. Turning them into something the world can see takes so long that most of it dies in your head.",
  },
  {
    num: "02",
    title: "Your team forgets what it knows",
    body: "People leave, context disappears, and hard-won expertise gets buried in chat threads no one will ever search. Your team's collective intelligence leaks out faster than it builds up.",
  },
  {
    num: "03",
    title: "The right people never find each other",
    body: "You match collaborators by job titles and résumés, not by what they actually know. The perfect expert for your problem might be one connection away — but you'd never know.",
  },
];

export const ProblemLayout = (): JSX.Element => {
  return (
    <section
      id="problem"
      className="px-6 md:px-10 lg:px-20 relative z-[1] reveal py-section"
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-16 md:gap-[60px]">
        {CARDS.map((card, i) => (
          <div key={card.num} className={`reveal reveal-delay-${i + 1}`}>
            <div className="block font-display font-normal text-[64px] md:text-display-2xl mb-5 md:mb-8 text-transparent [-webkit-text-stroke:1.2px_var(--color-accent)] md:[-webkit-text-stroke:1.5px_var(--color-accent)]">
              {card.num}
            </div>
            <div className="font-nav text-heading-sm md:text-heading-md font-bold mb-2.5 md:mb-3">
              {card.title}
            </div>
            <p className="text-body-xs md:text-body-sm text-theme-muted">
              {card.body}
            </p>
          </div>
        ))}
      </div>
      {/* Decorative thread SVG — strokes/fills use the theme accent
          (amber) and a lighter accent variant via inline style, so
          the colors track the current variant automatically. */}
      <svg
        className="hidden md:block absolute bottom-5 left-20 right-20 h-[60px] pointer-events-none"
        viewBox="0 0 1280 60"
        preserveAspectRatio="none"
      >
        <path
          d="M180,30 C380,25 580,22 780,25 C980,28 1080,32 1100,30"
          style={{ stroke: "var(--color-accent)" }}
          strokeWidth="1"
          fill="none"
          opacity="0.1"
        />
        <path
          d="M180,35 C420,30 660,28 900,32 C1020,34 1080,35 1100,34"
          style={{ stroke: "var(--palette-amber-light)" }}
          strokeWidth="0.6"
          fill="none"
          opacity="0.07"
        />
        <circle
          cx="180"
          cy="30"
          r="2"
          style={{ fill: "var(--color-accent)" }}
          opacity="0.2"
        />
        <circle
          cx="640"
          cy="25"
          r="1.5"
          style={{ fill: "var(--palette-amber-light)" }}
          opacity="0.15"
        />
        <circle
          cx="1100"
          cy="30"
          r="2"
          style={{ fill: "var(--color-accent)" }}
          opacity="0.2"
        />
      </svg>
    </section>
  );
};
