import type { JSX } from "preact";
import type { LinkDetailData, LinkDetail } from "./schema";
import {
  Head,
  DetailPageHeader,
  BackLink,
  TagsList,
  LinkButton,
  Card,
  Alert,
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
    <nav className="mt-12 pt-8 border-t border-theme-muted">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {prevLink ? (
          <Card href={`/links/${prevLink.id}`} variant="compact">
            <span className="text-xs text-theme-muted uppercase tracking-wide">
              Previous
            </span>
            <span className="block mt-1 font-medium text-heading group-hover:text-brand transition-colors truncate">
              {prevLink.title}
            </span>
          </Card>
        ) : (
          <div />
        )}
        {nextLink ? (
          <Card
            href={`/links/${nextLink.id}`}
            variant="compact"
            className="md:text-right"
          >
            <span className="text-xs text-theme-muted uppercase tracking-wide">
              Next
            </span>
            <span className="block mt-1 font-medium text-heading group-hover:text-brand transition-colors truncate">
              {nextLink.title}
            </span>
          </Card>
        ) : (
          <div />
        )}
      </div>
    </nav>
  );
};

export const LinkDetailLayout = ({
  link,
  prevLink,
  nextLink,
}: LinkDetailData): JSX.Element => {
  const isPending = link.status === "pending";
  // Check if source is from a conversation (Matrix, etc.)
  const isFromConversation = link.source.ref.startsWith("matrix:");

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
            <Alert variant="warning" title="Pending Review" className="mt-6">
              This link needs additional information or review.
            </Alert>
          )}

          <DetailPageHeader
            title={link.title}
            created={link.capturedAt}
            metadata={
              <span className="ml-2">
                • <span className="text-brand">{link.domain}</span>
                {isFromConversation && <span> • from {link.source.label}</span>}
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
          <Card variant="compact" className="mb-8">
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
          </Card>

          <LinkNavigation prevLink={prevLink} nextLink={nextLink} />
        </div>
      </div>
    </>
  );
};
