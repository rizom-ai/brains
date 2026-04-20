import type { JSX } from "preact";
import { Head } from "@brains/ui-library";
import type { TemplateAgent, AgentSkill } from "../schemas/agent";
import { AgentAvatar, KindBadge, extractDomain } from "./shared";

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
 * Section heading
 */
const SectionHeading = ({ children }: { children: string }): JSX.Element => (
  <h2 className="text-sm font-semibold text-theme-muted uppercase tracking-wide mb-3">
    {children}
  </h2>
);

/**
 * Individual skill row
 */
const SkillRow = ({ skill }: { skill: AgentSkill }): JSX.Element => (
  <div className="flex items-start gap-3 px-4 py-3 bg-theme-subtle rounded-lg">
    <div className="flex-1">
      <div className="text-sm font-semibold text-heading">{skill.name}</div>
      <div className="text-[13px] text-theme-muted">{skill.description}</div>
    </div>
    {skill.tags.length > 0 && (
      <div className="flex gap-1 flex-shrink-0">
        {skill.tags.map((tag) => (
          <span
            key={tag}
            className="text-[11px] px-2 py-0.5 bg-theme rounded-md text-theme-muted"
          >
            {tag}
          </span>
        ))}
      </div>
    )}
  </div>
);

/**
 * Sidebar connection info row
 */
const InfoRow = ({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}): JSX.Element => (
  <div className="flex justify-between text-[13px]">
    <span className="text-theme-muted">{label}</span>
    <span className={valueClassName ?? "text-heading"}>{value}</span>
  </div>
);

/**
 * Agent detail template — about/skills/notes with sidebar
 */
export const AgentDetailTemplate = ({
  agent,
  prevAgent,
  nextAgent,
}: AgentDetailProps): JSX.Element => {
  const { frontmatter, about, skills, notes } = agent;
  const domain = extractDomain(frontmatter.url);
  const isApproved = frontmatter.status === "approved";

  return (
    <>
      <Head
        title={frontmatter.name}
        description={about || `Agent profile for ${frontmatter.name}`}
      />
      <article className="agent-detail">
        <div className="container mx-auto px-6 md:px-8 py-12 md:py-20">
          {/* Back link */}
          <a
            href="/agents"
            className="text-sm text-theme-muted hover:text-brand transition-colors mb-6 inline-block"
          >
            ← Back to Directory
          </a>

          {/* Header */}
          <div className="flex items-start gap-6 mb-8">
            <AgentAvatar
              name={frontmatter.name}
              className="w-[72px] h-[72px] text-3xl"
            />
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-3xl md:text-4xl font-bold text-heading">
                  {frontmatter.name}
                </h1>
                <KindBadge kind={frontmatter.kind} />
              </div>
              <div className="text-base text-theme-muted mb-2">
                {frontmatter.brainName}
              </div>
              <div className="flex items-center gap-3 text-theme-muted">
                {frontmatter.organization && (
                  <span className="text-[15px]">
                    {frontmatter.organization}
                  </span>
                )}
                {frontmatter.organization && (
                  <span className="text-theme-muted opacity-40">·</span>
                )}
                <span className="text-sm">
                  Discovered {formatDate(frontmatter.discoveredAt)}
                </span>
              </div>
            </div>
          </div>

          <div className="border-b border-theme mb-8" />

          {!isApproved && (
            <div className="mb-8 rounded-xl border border-theme bg-theme-subtle px-5 py-4">
              <div className="text-sm font-semibold text-heading mb-1">
                Saved for review
              </div>
              <p className="text-sm text-theme-muted">
                This brain is discovered but not approved yet, so it cannot be
                called until you approve it.
              </p>
            </div>
          )}

          {/* Two-column layout */}
          <div className="flex flex-col md:flex-row gap-12">
            {/* Main content */}
            <div className="flex-[2] min-w-0">
              {/* About */}
              {about && (
                <section className="mb-8">
                  <SectionHeading>About</SectionHeading>
                  <p className="text-[15px] text-theme leading-relaxed">
                    {about}
                  </p>
                </section>
              )}

              {/* Skills */}
              {skills.length > 0 && (
                <section className="mb-8">
                  <SectionHeading>Skills</SectionHeading>
                  <div className="flex flex-col gap-2.5">
                    {skills.map((skill) => (
                      <SkillRow key={skill.name} skill={skill} />
                    ))}
                  </div>
                </section>
              )}

              {/* Notes */}
              {notes && (
                <section className="mb-8">
                  <SectionHeading>Notes</SectionHeading>
                  <p className="text-[15px] text-theme leading-relaxed">
                    {notes}
                  </p>
                </section>
              )}
            </div>

            {/* Sidebar */}
            <aside className="flex-1 md:pl-8 md:border-l border-theme-muted/20">
              {/* Brain */}
              <section className="mb-8">
                <SectionHeading>Brain</SectionHeading>
                <div className="p-4 bg-theme-subtle rounded-xl">
                  <div className="text-[15px] font-semibold text-heading mb-1">
                    {frontmatter.brainName}
                  </div>
                  {frontmatter.did && (
                    <div className="text-xs text-theme-muted font-mono">
                      {frontmatter.did}
                    </div>
                  )}
                </div>
              </section>

              {/* Connection */}
              <section className="mb-8">
                <SectionHeading>Connection</SectionHeading>
                <div className="flex flex-col gap-3">
                  <div>
                    <div className="text-[13px] text-theme-muted mb-0.5">
                      Endpoint
                    </div>
                    <div className="text-xs text-heading font-mono">
                      {frontmatter.url}
                    </div>
                  </div>
                  <InfoRow
                    label="Status"
                    value={
                      frontmatter.status === "approved"
                        ? "Approved"
                        : "Discovered"
                    }
                    valueClassName={
                      frontmatter.status === "approved"
                        ? "text-status-success font-medium"
                        : "text-theme-muted"
                    }
                  />
                </div>
              </section>

              {/* Visit link */}
              <a
                href={frontmatter.url.replace(/\/a2a\/?$/, "")}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center px-5 py-3 bg-theme-dark text-theme-inverse rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Visit {domain} ↗
              </a>
            </aside>
          </div>

          {(prevAgent ?? nextAgent) && (
            <nav className="mt-12 pt-6 border-t border-theme flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-h-[1px]">
                {prevAgent && (
                  <a
                    href={prevAgent.url}
                    className="inline-flex flex-col text-sm text-theme-muted hover:text-heading transition-colors"
                  >
                    <span>← Previous</span>
                    <span className="text-heading font-medium">
                      {prevAgent.frontmatter.name}
                    </span>
                  </a>
                )}
              </div>
              <div className="min-h-[1px] md:text-right">
                {nextAgent && (
                  <a
                    href={nextAgent.url}
                    className="inline-flex flex-col text-sm text-theme-muted hover:text-heading transition-colors"
                  >
                    <span>Next →</span>
                    <span className="text-heading font-medium">
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
