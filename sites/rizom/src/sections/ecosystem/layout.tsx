import type { JSX } from "preact";

export const EcosystemLayout = (): JSX.Element => {
  return (
    <section
      id="ecosystem"
      className="px-6 md:px-10 lg:px-20 relative z-[1] reveal pt-section pb-16 md:pb-24"
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        {/* ai card (highlighted, amber) */}
        <div className="reveal reveal-delay-1 relative overflow-hidden flex flex-col gap-2 p-6 md:p-8 rounded-xl md:rounded-2xl border border-[var(--color-card-eco-ai-border)] bg-[var(--color-card-eco-ai-bg)] transition-all duration-400 ease-[cubic-bezier(0.2,0.8,0.2,1)] hover:-translate-y-[3px] hover:border-white/12 hover:shadow-[0_16px_40px_-16px_var(--color-glow-eco-ai)] before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-[3px] before:bg-[linear-gradient(90deg,transparent,var(--color-accent)_30%,var(--color-accent)_70%,transparent)]">
          <div className="flex items-center gap-1 font-nav text-body-md mb-2">
            <span className="font-bold">rizom</span>
            <span className="font-bold text-accent">.</span>
            <span className="text-theme-muted">ai</span>
          </div>
          <div className="font-nav text-heading-sm md:text-heading-lg font-bold">
            The platform
          </div>
          <p className="text-body-xs text-theme-muted">
            Open-source AI agents built from your own knowledge. The tools that
            make everything else possible.
          </p>
          <a
            href="#"
            className="font-body text-label-md font-medium mt-2 text-accent transition-opacity hover:opacity-70"
          >
            You are here
          </a>
        </div>

        {/* foundation card (purple) */}
        <div className="reveal reveal-delay-2 relative overflow-hidden flex flex-col gap-2 p-6 md:p-8 rounded-xl md:rounded-2xl border border-[var(--color-card-eco-border)] bg-[var(--color-card-eco-bg)] transition-all duration-400 ease-[cubic-bezier(0.2,0.8,0.2,1)] hover:-translate-y-[3px] hover:border-white/12 hover:shadow-[0_16px_40px_-16px_var(--color-glow-eco-foundation)] before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-[2px] before:opacity-60 hover:before:opacity-100 before:transition-opacity before:bg-[linear-gradient(90deg,transparent,var(--color-secondary)_30%,var(--color-secondary)_70%,transparent)]">
          <div className="flex items-center gap-1 font-nav text-body-md mb-2">
            <span className="font-bold">rizom</span>
            <span className="font-bold text-accent">.</span>
            <span className="text-theme-muted">foundation</span>
          </div>
          <div className="font-nav text-heading-sm md:text-heading-lg font-bold">
            The vision
          </div>
          <p className="text-body-xs text-theme-muted">
            Essays, principles, and community. Why we believe the future of
            knowledge work is distributed, owned, and play.
          </p>
          <a
            href="#"
            className="font-body text-label-md font-medium mt-2 text-secondary transition-opacity hover:opacity-70"
          >
            Read the manifesto →
          </a>
        </div>

        {/* work card (purple/amber blend) */}
        <div className="reveal reveal-delay-3 relative overflow-hidden flex flex-col gap-2 p-6 md:p-8 rounded-xl md:rounded-2xl border border-[var(--color-card-eco-border)] bg-[var(--color-card-eco-bg)] transition-all duration-400 ease-[cubic-bezier(0.2,0.8,0.2,1)] hover:-translate-y-[3px] hover:border-white/12 hover:shadow-[0_16px_40px_-16px_var(--color-glow-eco-work)] before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-[2px] before:opacity-60 hover:before:opacity-100 before:transition-opacity before:bg-[linear-gradient(90deg,transparent,var(--palette-amber-light)_30%,var(--color-secondary)_70%,transparent)]">
          <div className="flex items-center gap-1 font-nav text-body-md mb-2">
            <span className="font-bold">rizom</span>
            <span className="font-bold text-accent">.</span>
            <span className="text-theme-muted">work</span>
          </div>
          <div className="font-nav text-heading-sm md:text-heading-lg font-bold">
            The network
          </div>
          <p className="text-body-xs text-theme-muted">
            Distributed consultancy powered by brains. Specialized expertise
            that mobilizes in hours, not months. Teams that assemble themselves.
          </p>
          <a
            href="#"
            className="font-body text-label-md font-medium mt-2 text-secondary transition-opacity hover:opacity-70"
          >
            Work with us →
          </a>
        </div>
      </div>
    </section>
  );
};
