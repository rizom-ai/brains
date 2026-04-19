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
  selectedStatus: "all" | "discovered" | "approved";
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

function getFilteredPageUrl(
  baseUrl: string,
  status: "discovered" | "approved",
  page: number,
): string {
  const params = new URLSearchParams({ status });
  if (page > 1) {
    params.set("page", String(page));
  }
  return `${baseUrl}?${params.toString()}`;
}

/**
 * Single agent card in the list
 */
const AgentCard = ({ agent }: { agent: TemplateAgent }): JSX.Element => {
  const { frontmatter, about, skills, url } = agent;
  const isApproved = frontmatter.status === "approved";

  return (
    <a
      href={url}
      className={`flex items-start gap-5 p-6 rounded-xl border border-theme bg-theme-subtle hover:shadow-lg transition-shadow ${
        isApproved ? "" : "opacity-70"
      }`}
    >
      <AgentAvatar name={frontmatter.name} className="w-12 h-12 text-lg" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-lg font-semibold text-heading">
            {frontmatter.name}
          </span>
          <KindBadge kind={frontmatter.kind} size="sm" />
          {frontmatter.organization && (
            <span className="text-xs text-theme-muted">
              · {frontmatter.organization}
            </span>
          )}
        </div>

        <div className="text-sm text-theme-muted mb-1">
          {frontmatter.brainName}
        </div>

        {about && (
          <p className="text-sm text-theme-muted line-clamp-2 mb-0">{about}</p>
        )}

        {isApproved && <SkillPills skills={skills} />}
      </div>

      <div className="flex flex-col items-end gap-1 flex-shrink-0 text-right">
        <span className="text-xs text-theme-muted">
          {extractDomain(frontmatter.url)}
        </span>
        <span className="text-[11px] text-theme-muted opacity-60">
          {isApproved
            ? `Discovered ${formatDiscoveryDate(frontmatter.discoveredAt)}`
            : "Discovered · approve before calling"}
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
  selectedStatus,
}: AgentListProps): JSX.Element => {
  const title = pageTitle ?? "Agent Directory";
  const totalCount = pagination?.totalItems ?? agents.length;
  const approvedAgents = agents.filter(
    (agent) => agent.frontmatter.status === "approved",
  );
  const discoveredAgents = agents.filter(
    (agent) => agent.frontmatter.status === "discovered",
  );
  const approvedCount = approvedAgents.length;
  const discoveredCount = discoveredAgents.length;
  const description = `Your network of ${totalCount} ${totalCount === 1 ? "brain" : "brains"} and their anchors`;

  return (
    <>
      <Head title={title} description={description} />
      <div className="agent-list bg-theme">
        <div className="container mx-auto px-6 md:px-12 max-w-5xl py-16 md:py-24">
          {/* Header */}
          <div className="mb-8 pb-6 border-b border-theme">
            <h1 className="text-4xl font-bold text-heading mb-2">{title}</h1>
            <p className="text-theme-muted mb-4">{description}</p>
            <div className="flex flex-wrap gap-2 text-sm mb-4">
              <span className="px-3 py-1 rounded-full bg-theme-subtle text-heading">
                {totalCount} total
              </span>
              <span className="px-3 py-1 rounded-full bg-theme-subtle text-status-success">
                {approvedCount} approved
              </span>
              <span className="px-3 py-1 rounded-full bg-theme-subtle text-theme-muted">
                {discoveredCount} discovered
              </span>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <a
                href={baseUrl}
                className={`px-3 py-1 rounded-full border transition-colors ${
                  selectedStatus === "all"
                    ? "border-theme text-heading bg-theme-subtle"
                    : "border-theme text-theme-muted hover:text-heading"
                }`}
              >
                All
              </a>
              <a
                href={`${baseUrl}?status=approved`}
                className={`px-3 py-1 rounded-full border transition-colors ${
                  selectedStatus === "approved"
                    ? "border-theme text-heading bg-theme-subtle"
                    : "border-theme text-theme-muted hover:text-heading"
                }`}
              >
                Approved
              </a>
              <a
                href={`${baseUrl}?status=discovered`}
                className={`px-3 py-1 rounded-full border transition-colors ${
                  selectedStatus === "discovered"
                    ? "border-theme text-heading bg-theme-subtle"
                    : "border-theme text-theme-muted hover:text-heading"
                }`}
              >
                Discovered
              </a>
            </div>
          </div>

          {selectedStatus === "all" && approvedAgents.length > 0 && (
            <section className="mb-10">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-heading">
                  Approved brains
                </h2>
                <span className="text-sm text-theme-muted">
                  {approvedAgents.length}
                </span>
              </div>
              <div className="flex flex-col gap-4">
                {approvedAgents.map((agent) => (
                  <AgentCard key={agent.id} agent={agent} />
                ))}
              </div>
            </section>
          )}

          {selectedStatus === "all" && discoveredAgents.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-heading">
                    Discovered brains
                  </h2>
                  <p className="text-sm text-theme-muted">
                    Review and approve these before calling them.
                  </p>
                </div>
                <span className="text-sm text-theme-muted">
                  {discoveredAgents.length}
                </span>
              </div>
              <div className="flex flex-col gap-4">
                {discoveredAgents.map((agent) => (
                  <AgentCard key={agent.id} agent={agent} />
                ))}
              </div>
            </section>
          )}

          {selectedStatus !== "all" && agents.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-heading">
                  {selectedStatus === "approved"
                    ? "Approved brains"
                    : "Discovered brains"}
                </h2>
                <span className="text-sm text-theme-muted">
                  {agents.length}
                </span>
              </div>
              <div className="flex flex-col gap-4">
                {agents.map((agent) => (
                  <AgentCard key={agent.id} agent={agent} />
                ))}
              </div>
            </section>
          )}

          {agents.length === 0 && (
            <p className="text-center text-theme-muted py-16">
              No agents in your directory yet.
            </p>
          )}

          {pagination &&
            pagination.totalPages > 1 &&
            selectedStatus === "all" && (
              <div className="mt-12">
                <Pagination
                  currentPage={pagination.currentPage}
                  totalPages={pagination.totalPages}
                  baseUrl={baseUrl}
                />
              </div>
            )}

          {pagination &&
            pagination.totalPages > 1 &&
            selectedStatus !== "all" && (
              <nav
                aria-label="Pagination"
                className="flex items-center justify-center gap-3 mt-12"
              >
                {pagination.hasPrevPage ? (
                  <a
                    href={getFilteredPageUrl(
                      baseUrl,
                      selectedStatus,
                      pagination.currentPage - 1,
                    )}
                    className="px-3 py-2 rounded-md border border-theme text-sm text-theme-muted hover:text-heading transition-colors"
                  >
                    ← Prev
                  </a>
                ) : (
                  <span className="px-3 py-2 rounded-md border border-theme text-sm text-theme-muted opacity-50">
                    ← Prev
                  </span>
                )}
                <span className="text-sm text-theme-muted">
                  Page {pagination.currentPage} of {pagination.totalPages}
                </span>
                {pagination.hasNextPage ? (
                  <a
                    href={getFilteredPageUrl(
                      baseUrl,
                      selectedStatus,
                      pagination.currentPage + 1,
                    )}
                    className="px-3 py-2 rounded-md border border-theme text-sm text-theme-muted hover:text-heading transition-colors"
                  >
                    Next →
                  </a>
                ) : (
                  <span className="px-3 py-2 rounded-md border border-theme text-sm text-theme-muted opacity-50">
                    Next →
                  </span>
                )}
              </nav>
            )}
        </div>
      </div>
    </>
  );
};
