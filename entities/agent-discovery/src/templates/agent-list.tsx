import type { JSX } from "preact";
import type { PaginationInfo } from "@brains/plugins";
import { Head, Pagination } from "@brains/ui-library";
import type { TemplateAgent, AgentStatus } from "../schemas/agent";
import {
  DotPattern,
  DotStatus,
  GhostGlyph,
  RuledHeading,
  extractDomain,
  isSightedAgent,
} from "./shared";

export interface AgentListProps {
  agents: TemplateAgent[];
  pageTitle?: string;
  pagination?: PaginationInfo | null;
  baseUrl?: string;
  selectedStatus: "all" | AgentStatus;
}

const MAX_SKILL_NAMES = 3;

function getFilteredPageUrl(
  baseUrl: string,
  status: AgentStatus,
  page: number,
): string {
  const params = new URLSearchParams({ status });
  if (page > 1) {
    params.set("page", String(page));
  }
  return `${baseUrl}?${params.toString()}`;
}

/**
 * Footer meta line: kind, then skills as prose with a +N overflow.
 * Sightings also carry their domain here since the eyebrow shows the
 * introducer instead.
 */
const CardMeta = ({ agent }: { agent: TemplateAgent }): JSX.Element => {
  const { frontmatter, skills } = agent;
  const parts: JSX.Element[] = [
    <span key="kind" className="font-medium text-theme-muted">
      {frontmatter.kind}
    </span>,
  ];

  if (isSightedAgent(frontmatter)) {
    parts.push(<span key="domain"> — {extractDomain(frontmatter.url)}</span>);
  }

  if (frontmatter.status !== "archived" && skills.length > 0) {
    const names = skills.slice(0, MAX_SKILL_NAMES).map((s) => s.name);
    const overflow = skills.length - names.length;
    parts.push(
      <span key="skills">
        {" — "}
        {names.join(", ")}
        {overflow > 0 ? ` +${overflow}` : ""}
      </span>,
    );
  }

  return (
    <div className="mt-4 pt-3.5 border-t border-theme text-[13px] text-theme-muted">
      {parts}
    </div>
  );
};

/**
 * Single agent card in the grid
 */
const AgentCard = ({ agent }: { agent: TemplateAgent }): JSX.Element => {
  const { frontmatter, about, url } = agent;
  const isArchived = frontmatter.status === "archived";
  const isSighted = isSightedAgent(frontmatter);
  const introducers = frontmatter.introducedBy ?? [];

  return (
    <a
      href={url}
      className={`relative overflow-hidden flex flex-col p-5 sm:px-7 sm:py-6 rounded-md border border-theme bg-theme-subtle hover:border-brand hover:shadow-lg transition-all ${
        isArchived ? "opacity-55" : ""
      }`}
      style={
        isSighted
          ? {
              background:
                "linear-gradient(135deg, var(--color-status-warning-bg), var(--color-bg-subtle) 55%)",
            }
          : undefined
      }
    >
      <GhostGlyph name={frontmatter.name} />

      <div className="flex flex-wrap items-center gap-2 font-mono text-xs mb-2.5">
        {isSighted ? (
          <>
            <span className="text-status-warning font-medium">
              via {introducers[0]}
            </span>
            {frontmatter.hops !== undefined && (
              <span className="text-theme-muted">
                · {frontmatter.hops} hops
              </span>
            )}
          </>
        ) : (
          <>
            <span className="text-brand font-medium">
              {extractDomain(frontmatter.url)}
            </span>
            {frontmatter.organization && (
              <span className="text-theme-muted">
                · {frontmatter.organization}
              </span>
            )}
          </>
        )}
        <DotStatus frontmatter={frontmatter} />
      </div>

      <h3 className="font-heading font-semibold text-[27px] leading-tight text-heading mb-2">
        {frontmatter.name}
      </h3>

      {about && (
        <p className="text-sm text-theme-muted line-clamp-2 mb-0">{about}</p>
      )}

      <CardMeta agent={agent} />
    </a>
  );
};

const StatTab = ({
  label,
  count,
  href,
  active,
}: {
  label: string;
  count: number;
  href: string;
  active: boolean;
}): JSX.Element => (
  <a
    href={href}
    data-count={count}
    className={`flex flex-col gap-0.5 pb-2.5 border-b-2 transition-colors ${
      active ? "border-brand" : "border-transparent"
    }`}
  >
    <span
      className={`font-heading font-medium text-3xl leading-none ${
        active ? "text-heading" : "text-theme-muted"
      }`}
    >
      {count}
    </span>
    <span
      className={`font-mono text-[11px] uppercase tracking-[0.12em] ${
        active ? "text-brand" : "text-theme-muted"
      }`}
    >
      {label}
    </span>
  </a>
);

const AgentSection = ({
  title,
  hint,
  agents,
}: {
  title: string;
  hint?: string;
  agents: TemplateAgent[];
}): JSX.Element => (
  <section className="mt-14">
    <RuledHeading title={title} count={agents.length} {...(hint && { hint })} />
    <div className="grid gap-4 md:grid-cols-2">
      {agents.map((agent) => (
        <AgentCard key={agent.id} agent={agent} />
      ))}
    </div>
  </section>
);

const SECTION_COPY: Record<AgentStatus, { title: string; hint?: string }> = {
  approved: { title: "Connected" },
  discovered: {
    title: "Sightings",
    hint: "seen in peers' directories — approve to connect",
  },
  archived: {
    title: "Archived",
    hint: "kept as history — can't be called",
  },
};

/**
 * Agent directory list template — editorial masthead with stat tabs
 * over a card grid grouped by status
 */
export const AgentListTemplate = ({
  agents,
  pageTitle,
  pagination,
  baseUrl = "/agents",
  selectedStatus,
}: AgentListProps): JSX.Element => {
  const title = pageTitle ?? "Agents";
  const totalCount = pagination?.totalItems ?? agents.length;
  const byStatus: Record<AgentStatus, TemplateAgent[]> = {
    approved: agents.filter((a) => a.frontmatter.status === "approved"),
    discovered: agents.filter((a) => a.frontmatter.status === "discovered"),
    archived: agents.filter((a) => a.frontmatter.status === "archived"),
  };
  const description = `Your network of ${totalCount} ${totalCount === 1 ? "brain" : "brains"} and their anchors`;

  const tabs: { key: "all" | AgentStatus; label: string; href: string }[] = [
    { key: "all", label: "All", href: baseUrl },
    { key: "approved", label: "Connected", href: `${baseUrl}?status=approved` },
    {
      key: "discovered",
      label: "Sightings",
      href: `${baseUrl}?status=discovered`,
    },
    { key: "archived", label: "Archived", href: `${baseUrl}?status=archived` },
  ];

  return (
    <>
      <Head title={title} description={description} />
      <div className="agent-list bg-theme">
        <div className="container mx-auto px-6 md:px-12 max-w-5xl py-14 md:py-20">
          {/* Masthead */}
          <div className="relative">
            <DotPattern />
            <div className="relative pt-8 pb-2">
              <div className="font-mono text-[11.5px] font-medium uppercase tracking-[0.18em] text-brand mb-3.5">
                Agent network
              </div>
              <h1 className="font-heading font-semibold text-5xl md:text-6xl leading-none tracking-tight text-heading mb-4">
                {title}
              </h1>
              <p className="text-[17px] font-light text-theme-muted max-w-[52ch] mb-0">
                Brains discovered, sighted, and connected through the A2A
                network — your corner of the rhizome.
              </p>
              <div className="flex gap-10 mt-9">
                {tabs.map((tab) => (
                  <StatTab
                    key={tab.key}
                    label={tab.label}
                    count={
                      tab.key === "all"
                        ? agents.length
                        : byStatus[tab.key].length
                    }
                    href={tab.href}
                    active={selectedStatus === tab.key}
                  />
                ))}
              </div>
            </div>
          </div>

          {selectedStatus === "all" &&
            (["approved", "discovered", "archived"] as const).map(
              (status) =>
                byStatus[status].length > 0 && (
                  <AgentSection
                    key={status}
                    title={SECTION_COPY[status].title}
                    {...(SECTION_COPY[status].hint && {
                      hint: SECTION_COPY[status].hint,
                    })}
                    agents={byStatus[status]}
                  />
                ),
            )}

          {selectedStatus !== "all" && agents.length > 0 && (
            <AgentSection
              title={SECTION_COPY[selectedStatus].title}
              {...(SECTION_COPY[selectedStatus].hint && {
                hint: SECTION_COPY[selectedStatus].hint,
              })}
              agents={agents}
            />
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
                    className="px-4 py-2.5 rounded-md border border-theme text-sm text-theme-muted hover:text-heading transition-colors"
                  >
                    ← Prev
                  </a>
                ) : (
                  <span className="px-4 py-2.5 rounded-md border border-theme text-sm text-theme-muted opacity-50">
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
                    className="px-4 py-2.5 rounded-md border border-theme text-sm text-theme-muted hover:text-heading transition-colors"
                  >
                    Next →
                  </a>
                ) : (
                  <span className="px-4 py-2.5 rounded-md border border-theme text-sm text-theme-muted opacity-50">
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
