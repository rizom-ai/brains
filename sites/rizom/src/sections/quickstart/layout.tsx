import type { JSX } from "preact";

const OK_LINES = [
  "✓ Web server → localhost:3000",
  "✓ MCP server → localhost:3001",
  "✓ A2A endpoint → localhost:3002",
  "✓ CMS dashboard → localhost:3000/admin",
];

export const QuickstartLayout = (): JSX.Element => {
  return (
    <section
      id="quickstart"
      className="px-6 md:px-10 lg:px-20 relative z-[1] reveal py-section"
    >
      <div className="flex flex-col md:flex-row gap-8 md:gap-20 items-start">
        <div className="w-full md:w-[420px] shrink-0">
          <span className="inline-flex items-center px-5 py-2 border border-accent text-accent rounded-[20px] font-label text-label-md font-semibold tracking-[0.09375em] uppercase">
            Quick Start
          </span>
          <h2 className="font-display text-[28px] md:text-[36px] tracking-[-0.5px] leading-[1.2] mt-4">
            Running in under a minute
          </h2>
          <p className="text-body-xs md:text-body-sm text-theme-muted mt-4">
            One package. Three commands. Your brain boots with a website, MCP
            server, CMS, and chat interface — all in a single process.
          </p>
        </div>
        <div className="flex-1 w-full bg-[var(--color-surface-terminal)] border border-[var(--color-surface-terminal-border)] rounded-[10px] md:rounded-xl p-5 md:p-8 font-mono text-label-sm md:text-body-xs overflow-x-auto">
          <div className="text-theme-light text-label-sm mb-1">Install</div>
          <div className="text-accent mb-4 break-all md:break-normal">
            $ bun add -g @rizom/brain
          </div>
          <div className="text-theme-light text-label-sm mb-1">Create</div>
          <div className="text-accent mb-4 break-all md:break-normal">
            $ brain init mybrain --model rover
          </div>
          <div className="text-theme-light text-label-sm mb-1">Run</div>
          <div className="text-accent mb-4 break-all md:break-normal">
            $ cd mybrain && brain start
          </div>
          <div className="h-px bg-white/[0.06] my-4" />
          {OK_LINES.map((line) => (
            <div
              key={line}
              className="text-[var(--color-success)] text-label-sm md:text-body-xs"
            >
              {line}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
