import type { JSX } from "preact";
import type { PaginationInfo } from "@brains/plugins";
import { Head, Pagination } from "@brains/ui-library";
import type { TemplateAgent, AgentSkill } from "../schemas/agent";
import { AgentAvatar, KindBadge, extractDomain } from "./shared";

export interface AgentListProps {
  agents: TemplateAgent[];
  pageTitle?: string;
  pagination?: PaginationInfo | null;
  baseUrl?: string;
}

const SkillPills = ({
  skills,
}: {
  skills: AgentSkill[];
}): JSX.Element | null => {
  if (skills.length === 0) return null;

  return (
    <div className="flex gap-1.5 flex-wrap mt-2">
      {skills.map((skill) => (
        <span
          key={skill.name}
          className="text-[11px] px-2 py-0.5 bg-theme-subtle rounded-md text-theme-muted"
        >
          {skill.name}
        </span>
      ))}
    </div>
  );
};

function formatDiscoveryDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Single agent card in the list
 */
const AgentCard = ({ agent }: { agent: TemplateAgent }): JSX.Element => {
  const { frontmatter, about, skills, url } = agent;
  const isArchived = frontmatter.status === "archived";

  return (
    <a
      href={url}
      className={`flex items-start gap-5 p-6 rounded-xl border border-theme bg-theme-subtle hover:shadow-lg transition-shadow ${
        isArchived ? "opacity-40" : ""
      }`}
    >
      <AgentAvatar name={frontmatter.name} className="w-12 h-12 text-lg" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-lg font-semibold text-heading">
            {frontmatter.name}
          </span>
          <KindBadge
            kind={isArchived ? "archived" : frontmatter.kind}
            size="sm"
          />
          {frontmatter.organization && (
            <span className="text-xs text-theme-muted">
              · {frontmatter.organization}
            </span>
          )}
        </div>

        {about && (
          <p className="text-sm text-theme-muted line-clamp-2 mb-0">{about}</p>
        )}

        {!isArchived && <SkillPills skills={skills} />}
      </div>

      <div className="flex flex-col items-end gap-1 flex-shrink-0 text-right">
        <span className="text-xs text-theme-muted">
          {extractDomain(frontmatter.url)}
        </span>
        <span className="text-[11px] text-theme-muted opacity-60">
          {isArchived
            ? "Archived"
            : `Discovered ${formatDiscoveryDate(frontmatter.discoveredAt)}`}
        </span>
      </div>
    </a>
  );
};

/**
 * Agent directory list template — contact list with filter pills
 */
export const AgentListTemplate = ({
  agents,
  pageTitle,
  pagination,
  baseUrl = "/agents",
}: AgentListProps): JSX.Element => {
  const title = pageTitle ?? "Agent Directory";
  const totalCount = pagination?.totalItems ?? agents.length;
  const description = `Your network of ${totalCount} ${totalCount === 1 ? "brain" : "brains"} and their anchors`;

  return (
    <>
      <Head title={title} description={description} />
      <div className="agent-list bg-theme">
        <div className="container mx-auto px-6 md:px-12 max-w-5xl py-16 md:py-24">
          {/* Header */}
          <div className="mb-8 pb-6 border-b border-theme">
            <h1 className="text-4xl font-bold text-heading mb-2">{title}</h1>
            <p className="text-theme-muted">{description}</p>
          </div>

          {/* Agent cards */}
          <div className="flex flex-col gap-4">
            {agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>

          {/* Empty state */}
          {agents.length === 0 && (
            <p className="text-center text-theme-muted py-16">
              No agents in your directory yet.
            </p>
          )}

          {pagination && pagination.totalPages > 1 && (
            <div className="mt-12">
              <Pagination
                currentPage={pagination.currentPage}
                totalPages={pagination.totalPages}
                baseUrl={baseUrl}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
};
