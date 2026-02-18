import type { JSX } from "preact";
import type { EnrichedProject } from "../schemas/project";
import type { PaginationInfo } from "@brains/plugins";
import { Card, CardTitle, Head, Pagination } from "@brains/ui-library";

export interface ProjectListProps {
  projects: EnrichedProject[];
  pageTitle?: string;
  pagination?: PaginationInfo | null;
  baseUrl?: string;
}

/**
 * Project card component for grid display
 */
const ProjectCard = ({
  project,
}: {
  project: EnrichedProject;
}): JSX.Element => {
  const { frontmatter, url, coverImageUrl } = project;

  return (
    <Card href={url}>
      {coverImageUrl && (
        <img
          src={coverImageUrl}
          alt={frontmatter.title}
          className="w-full h-56 object-cover rounded-md mb-4"
        />
      )}
      <CardTitle>{frontmatter.title}</CardTitle>
      <p className="text-theme leading-relaxed">{frontmatter.description}</p>
    </Card>
  );
};

/**
 * Project list template - displays portfolio case studies in a grid
 */
export const ProjectListTemplate = ({
  projects,
  pageTitle,
  pagination,
  baseUrl = "/projects",
}: ProjectListProps): JSX.Element => {
  const title = pageTitle ?? "Projects";
  const totalCount = pagination?.totalItems ?? projects.length;
  const description = `Browse all ${totalCount} ${totalCount === 1 ? "project" : "projects"}`;

  return (
    <>
      <Head title={title} description={description} />
      <div className="project-list bg-theme">
        <div className="container mx-auto px-6 md:px-12 max-w-5xl py-16 md:py-24">
          <h1 className="text-4xl font-bold text-heading mb-12">{title}</h1>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>

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
