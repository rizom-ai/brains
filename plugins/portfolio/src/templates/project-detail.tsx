import type { JSX } from "preact";
import { Head, ProseContent } from "@brains/ui-library";
import { markdownToHtml } from "@brains/utils";
import type { EnrichedProject } from "../schemas/project";

export interface ProjectDetailProps {
  project: EnrichedProject;
  prevProject: EnrichedProject | null;
  nextProject: EnrichedProject | null;
}

/**
 * Project navigation component for prev/next projects
 */
const ProjectNavigation = ({
  prevProject,
  nextProject,
}: {
  prevProject: EnrichedProject | null;
  nextProject: EnrichedProject | null;
}): JSX.Element | null => {
  if (!prevProject && !nextProject) return null;

  return (
    <nav className="flex justify-between items-center pt-12 mt-12 border-t border-theme-muted">
      {prevProject ? (
        <a
          href={prevProject.url}
          className="group flex flex-col items-start max-w-[45%]"
        >
          <span className="text-sm text-theme-muted mb-1">
            Previous Project
          </span>
          <span className="text-heading font-medium group-hover:text-brand transition-colors">
            {prevProject.metadata.title}
          </span>
        </a>
      ) : (
        <div />
      )}
      {nextProject && (
        <a
          href={nextProject.url}
          className="group flex flex-col items-end max-w-[45%] text-right"
        >
          <span className="text-sm text-theme-muted mb-1">Next Project</span>
          <span className="text-heading font-medium group-hover:text-brand transition-colors">
            {nextProject.metadata.title}
          </span>
        </a>
      )}
    </nav>
  );
};

/**
 * Case study section with heading
 */
const CaseStudySection = ({
  title,
  content,
}: {
  title: string;
  content: string;
}): JSX.Element | null => {
  if (!content) return null;

  const htmlContent = markdownToHtml(content);

  return (
    <section className="mb-12">
      <h2 className="text-2xl font-bold text-heading mb-4">{title}</h2>
      <ProseContent html={htmlContent} />
    </section>
  );
};

/**
 * Project detail template - displays a portfolio case study
 * Shows structured content: Context, Problem, Solution, Outcome
 */
export const ProjectDetailTemplate = ({
  project,
  prevProject,
  nextProject,
}: ProjectDetailProps): JSX.Element => {
  const { frontmatter, structuredContent, metadata, coverImageUrl } = project;

  return (
    <>
      <Head
        title={frontmatter.title}
        description={frontmatter.description}
        {...(coverImageUrl && {
          ogImage: coverImageUrl,
        })}
        ogType="article"
      />
      <article className="project-detail">
        <div className="container mx-auto px-6 md:px-8 py-12 md:py-20">
          <div className="max-w-3xl mx-auto">
            {coverImageUrl && (
              <img
                src={coverImageUrl}
                alt={frontmatter.title}
                className="w-full h-80 md:h-96 object-cover rounded-lg mb-8 shadow-lg"
              />
            )}

            {/* Title */}
            <h1 className="text-4xl md:text-5xl font-bold text-heading leading-tight tracking-tight mb-4">
              {frontmatter.title}
            </h1>

            {/* Metadata: Year + Technologies */}
            <div className="flex flex-wrap items-center gap-4 text-theme-muted mb-8">
              <span className="text-sm">{metadata.year}</span>
              {frontmatter.technologies &&
                frontmatter.technologies.length > 0 && (
                  <>
                    <span className="text-theme-muted">|</span>
                    <div className="flex flex-wrap gap-2">
                      {frontmatter.technologies.map((tech) => (
                        <span
                          key={tech}
                          className="text-xs px-2 py-1 bg-theme-muted rounded-full"
                        >
                          {tech}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              {frontmatter.url && (
                <>
                  <span className="text-theme-muted">|</span>
                  <a
                    href={frontmatter.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand hover:text-brand-dark transition-colors"
                  >
                    View Project
                  </a>
                </>
              )}
            </div>

            {/* Description */}
            <p className="text-lg text-theme mb-12 leading-relaxed">
              {frontmatter.description}
            </p>

            {/* Case Study Sections */}
            {structuredContent && (
              <div className="case-study">
                <CaseStudySection
                  title="Context"
                  content={structuredContent.context}
                />
                <CaseStudySection
                  title="Problem"
                  content={structuredContent.problem}
                />
                <CaseStudySection
                  title="Solution"
                  content={structuredContent.solution}
                />
                <CaseStudySection
                  title="Outcome"
                  content={structuredContent.outcome}
                />
              </div>
            )}

            {/* Prev/Next Navigation */}
            <ProjectNavigation
              prevProject={prevProject}
              nextProject={nextProject}
            />
          </div>
        </div>
      </article>
    </>
  );
};
