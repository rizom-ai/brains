import type { JSX } from "preact";
import { Head } from "@brains/ui-library";
import type { TemplateAgent, AgentSkill } from "../schemas/agent";
import {
  DotPattern,
  RuledHeading,
  extractDomain,
  isSightedAgent,
} from "./shared";

export interface AgentDetailProps {
  agent: TemplateAgent;
  prevAgent?: TemplateAgent | null;
  nextAgent?: TemplateAgent | null;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Individual skill card — Fraunces name, description, mono tag line.
 */
const SkillCard = ({ skill }: { skill: AgentSkill }): JSX.Element => (
  <div className="px-4.5 py-4 bg-theme-subtle border border-theme rounded-md">
    <div className="font-heading font-semibold text-[17px] text-heading mb-0.5">
      {skill.name}
    </div>
    <div className="text-[13.5px] text-theme-muted">{skill.description}</div>
    {skill.tags.length > 0 && (
      <div className="mt-2.5 font-mono text-[11px] tracking-[0.04em] text-theme-muted">
        {skill.tags.join(" · ")}
      </div>
    )}
  </div>
);

/**
 * Hairline key-value row for the connection sidebar
 */
const InfoRow = ({
  label,
  value,
  mono = false,
  valueClassName,
}: {
  label: string;
  value: string;
  mono?: boolean;
  valueClassName?: string;
}): JSX.Element => (
  <div className="py-2.5 border-b border-theme">
    <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-theme-muted mb-0.5">
      {label}
    </div>
    <div
      className={`text-[13.5px] ${mono ? "font-mono text-xs break-all" : ""} ${valueClassName ?? "text-heading"}`}
    >
      {value}
    </div>
  </div>
);

/**
 * Agent detail template — editorial hero with provenance eyebrow,
 * skills grid, and a hairline connection sidebar
 */
export const AgentDetailTemplate = ({
  agent,
  prevAgent,
  nextAgent,
}: AgentDetailProps): JSX.Element => {
  const { frontmatter, about, skills, notes } = agent;
  const domain = extractDomain(frontmatter.url);
  const isApproved = frontmatter.status === "approved";
  const isArchived = frontmatter.status === "archived";
  const isSighted = isSightedAgent(frontmatter);
  const introducers = frontmatter.introducedBy ?? [];
  const firstSeen = formatDate(frontmatter.discoveredAt);

  const statusLine = isApproved ? (
    <span className="text-status-success">
      connected — first seen {firstSeen}
    </span>
  ) : isArchived ? (
    <span className="text-theme-muted">archived</span>
  ) : isSighted ? (
    <span className="text-status-warning">
      sighted through {introducers.join(", ")} —{" "}
      {frontmatter.hops !== undefined ? `${frontmatter.hops} hops — ` : ""}
      {firstSeen}
    </span>
  ) : (
    <span className="text-status-warning">awaiting approval</span>
  );

  return (
    <>
      <Head
        title={frontmatter.name}
        description={about || `Agent profile for ${frontmatter.name}`}
      />
      <article className="agent-detail bg-theme">
        <div className="container mx-auto px-6 md:px-8 py-10 md:py-14 max-w-5xl">
          {/* Back link */}
          <a
            href="/agents"
            className="font-mono text-xs tracking-[0.08em] text-theme-muted hover:text-brand transition-colors mb-10 inline-block"
          >
            ← all agents
          </a>

          {/* Hero */}
          <div className="relative mb-11">
            <DotPattern />
            <div className="relative">
              <div className="flex items-center gap-2.5 flex-wrap font-mono text-xs mb-4">
                <span className="text-brand font-medium">{domain}</span>
                <span className="text-theme-muted opacity-60">·</span>
                <span className="text-theme-muted">{frontmatter.kind}</span>
                {frontmatter.organization && (
                  <>
                    <span className="text-theme-muted opacity-60">·</span>
                    <span className="text-theme-muted">
                      {frontmatter.organization}
                    </span>
                  </>
                )}
                <span className="text-theme-muted opacity-60">·</span>
                {statusLine}
              </div>
              <h1 className="font-heading font-semibold text-5xl md:text-[64px] leading-none tracking-tight text-heading mb-5">
                {frontmatter.name}
              </h1>
              {about && (
                <p className="text-lg md:text-[19px] font-light leading-relaxed text-theme-muted max-w-[58ch] mb-0">
                  {about}
                </p>
              )}
              <div className="mt-3.5 font-mono text-xs text-theme-muted">
                {frontmatter.brainName}
              </div>
            </div>
          </div>

          {!isApproved && !isArchived && (
            <div
              className="flex items-center gap-4 flex-wrap px-5.5 py-4.5 mb-12 rounded-md bg-status-warning border"
              style={{ borderColor: "var(--color-status-warning-text)" }}
            >
              <div className="flex-1 basis-80 text-sm text-theme-muted">
                <span className="font-semibold text-status-warning">
                  Not yet callable.
                </span>{" "}
                {isSighted
                  ? "This brain appeared in a connected peer's public directory. "
                  : ""}
                Ask your brain to approve it:
              </div>
              <span
                className="font-mono text-xs tracking-[0.02em] text-status-warning border px-4 py-2 rounded whitespace-nowrap"
                style={{ borderColor: "var(--color-status-warning-text)" }}
              >
                “connect to {agent.id}”
              </span>
            </div>
          )}

          {isArchived && (
            <div className="px-5.5 py-4.5 mb-12 rounded-md border border-theme bg-theme-subtle text-sm text-theme-muted">
              <span className="font-semibold text-heading">Archived.</span>{" "}
              Retained as history — it can't be called unless it is approved
              again.
            </div>
          )}

          {/* Two-column layout */}
          <div className="grid md:grid-cols-[1fr_300px] gap-10 md:gap-16">
            {/* Main content */}
            <div className="min-w-0">
              {/* Skills */}
              {skills.length > 0 && (
                <section className="mb-11">
                  <RuledHeading title="Skills" />
                  <div className="grid sm:grid-cols-2 gap-3.5">
                    {skills.map((skill) => (
                      <SkillCard key={skill.name} skill={skill} />
                    ))}
                  </div>
                </section>
              )}

              {/* Notes */}
              {notes && (
                <section className="mb-11">
                  <RuledHeading title="Notes" />
                  <p className="text-[15px] text-theme leading-relaxed max-w-[60ch]">
                    {notes}
                  </p>
                </section>
              )}
            </div>

            {/* Sidebar — hairline above when stacked, plain when columned */}
            <aside className="min-w-0 border-t border-theme pt-8 md:border-t-0 md:pt-0">
              <div className="mb-9">
                <RuledHeading title="Connection" />
                <InfoRow
                  label="Status"
                  value={
                    isApproved
                      ? "Connected"
                      : isArchived
                        ? "Archived"
                        : isSighted
                          ? "Sighted — awaiting approval"
                          : "Awaiting approval"
                  }
                  valueClassName={
                    isApproved
                      ? "text-status-success font-medium"
                      : isArchived
                        ? "text-theme-muted"
                        : "text-status-warning font-medium"
                  }
                />
                <InfoRow label="Endpoint" value={frontmatter.url} mono />
                <InfoRow label="First seen" value={firstSeen} />
                {frontmatter.hops !== undefined && (
                  <InfoRow
                    label="Distance"
                    value={`${frontmatter.hops} hops`}
                  />
                )}
                {frontmatter.did && (
                  <InfoRow label="Brain DID" value={frontmatter.did} mono />
                )}
              </div>

              {isSighted && (
                <div className="mb-9">
                  <RuledHeading title="Introduced by" />
                  <div className="flex flex-col">
                    {introducers.map((introducer) => (
                      <a
                        key={introducer}
                        href={`https://${introducer}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="py-1.5 text-sm font-medium text-heading hover:text-brand transition-colors"
                      >
                        {introducer} ↗
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Visit link */}
              <a
                href={frontmatter.url.replace(/\/a2a\/?$/, "")}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 px-5 py-3 border border-current rounded-md font-mono text-[13px] text-heading hover:bg-theme-dark hover:text-theme-inverse transition-colors"
              >
                visit {domain} ↗
              </a>
            </aside>
          </div>

          {(prevAgent ?? nextAgent) && (
            <nav className="mt-16 pt-7 border-t border-theme flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-h-[1px]">
                {prevAgent && (
                  <a
                    href={prevAgent.url}
                    className="inline-flex flex-col group"
                  >
                    <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-theme-muted">
                      ← previous
                    </span>
                    <span className="font-heading font-semibold text-lg text-heading group-hover:text-brand transition-colors">
                      {prevAgent.frontmatter.name}
                    </span>
                  </a>
                )}
              </div>
              <div className="min-h-[1px] md:text-right">
                {nextAgent && (
                  <a
                    href={nextAgent.url}
                    className="inline-flex flex-col group"
                  >
                    <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-theme-muted">
                      next →
                    </span>
                    <span className="font-heading font-semibold text-lg text-heading group-hover:text-brand transition-colors">
                      {nextAgent.frontmatter.name}
                    </span>
                  </a>
                )}
              </div>
            </nav>
          )}
        </div>
      </article>
    </>
  );
};
