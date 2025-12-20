import type { JSX } from "preact";
import type { LinkDetailData, LinkDetail } from "./schema";
import {
  Head,
  DetailPageHeader,
  BackLink,
  TagsList,
  LinkButton,
} from "@brains/ui-library";

interface LinkNavigationProps {
  prevLink: LinkDetail | null;
  nextLink: LinkDetail | null;
}

const LinkNavigation = ({
  prevLink,
  nextLink,
}: LinkNavigationProps): JSX.Element | null => {
  if (!prevLink && !nextLink) return null;

  return (
    <nav className="flex justify-between items-center mt-12 pt-8 border-t border-theme-muted">
      {prevLink ? (
        <a
          href={`/links/${prevLink.id}`}
          className="flex flex-col text-left group"
        >
          <span className="text-xs text-theme-muted uppercase tracking-wide">
            Previous
          </span>
          <span className="text-brand group-hover:text-brand-dark font-medium truncate max-w-xs">
            {prevLink.title}
          </span>
        </a>
      ) : (
        <div />
      )}
      {nextLink ? (
        <a
          href={`/links/${nextLink.id}`}
          className="flex flex-col text-right group"
        >
          <span className="text-xs text-theme-muted uppercase tracking-wide">
            Next
          </span>
          <span className="text-brand group-hover:text-brand-dark font-medium truncate max-w-xs">
            {nextLink.title}
          </span>
        </a>
      ) : (
        <div />
      )}
    </nav>
  );
};

export const LinkDetailLayout = ({
  link,
  prevLink,
  nextLink,
}: LinkDetailData): JSX.Element => {
  const isPending = link.status === "pending";

  return (
    <>
      <Head
        title={link.title}
        description={link.description ?? `Link to ${link.domain}`}
        ogType="article"
      />
      <div className="container mx-auto px-6 md:px-8 py-12 md:py-20">
        <div className="max-w-3xl mx-auto">
          <BackLink href="/links">Back to Links</BackLink>

          {/* Status badge for pending links */}
          {isPending && (
            <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <p className="font-medium text-yellow-800 dark:text-yellow-200">
                Pending Review
              </p>
              {link.extractionError && (
                <p className="mt-1 text-sm text-yellow-700 dark:text-yellow-300">
                  {link.extractionError}
                </p>
              )}
            </div>
          )}

          <DetailPageHeader
            title={link.title}
            created={link.capturedAt}
            metadata={
              <span className="ml-2">
                • <span className="text-brand">{link.domain}</span>
                {link.source.type === "conversation" && (
                  <span> • from {link.source.title}</span>
                )}
              </span>
            }
          />

          {/* Visit Link button */}
          <div className="mb-8">
            <LinkButton href={link.url} external variant="primary">
              Visit Link
            </LinkButton>
          </div>

          {/* Description */}
          {link.description && (
            <section className="mb-6">
              <h2 className="text-lg font-semibold text-heading mb-2">
                Description
              </h2>
              <p className="text-theme">{link.description}</p>
            </section>
          )}

          {/* Summary */}
          {link.summary && (
            <section className="mb-6">
              <h2 className="text-lg font-semibold text-heading mb-2">
                Summary
              </h2>
              <p className="text-theme leading-relaxed">{link.summary}</p>
            </section>
          )}

          {/* Keywords */}
          {link.keywords.length > 0 && (
            <section className="mb-8">
              <h2 className="text-lg font-semibold text-heading mb-3">
                Keywords
              </h2>
              <TagsList tags={link.keywords} />
            </section>
          )}

          {/* Full URL */}
          <div className="p-4 bg-theme-muted rounded-lg mb-8">
            <p className="text-xs text-theme-muted uppercase tracking-wide mb-1">
              Full URL
            </p>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-brand hover:text-brand-dark break-all"
            >
              {link.url}
            </a>
          </div>

          <LinkNavigation prevLink={prevLink} nextLink={nextLink} />
        </div>
      </div>
    </>
  );
};
