import type { JSX } from "preact";
import type { LinkListData } from "./schema";
import {
  Card,
  CardTitle,
  CardMetadata,
  ListPageHeader,
  EmptyState,
  TagsList,
  formatDate,
} from "@brains/ui-library";

export const LinkListLayout = ({
  links,
  totalCount,
}: LinkListData): JSX.Element => {
  return (
    <div className="link-list-container w-full max-w-4xl mx-auto p-6 bg-theme">
      <ListPageHeader
        title="Captured Links"
        count={totalCount}
        singularLabel="link"
        description="captured from conversations and manual additions"
      />

      <div className="space-y-4">
        {links.map((link) => (
          <Card key={link.id} variant="vertical">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <CardTitle href={link.url} className="text-lg mb-1 truncate">
                  {link.title}
                </CardTitle>

                <CardMetadata className="mb-2">
                  <p className="text-sm text-theme-muted truncate">
                    {link.domain}
                  </p>
                </CardMetadata>

                <p className="text-theme mb-2 font-medium">
                  {link.description}
                </p>

                <p className="text-theme-muted mb-3 text-sm line-clamp-3">
                  {link.summary}
                </p>

                <TagsList
                  tags={link.keywords}
                  maxVisible={4}
                  className="mb-2"
                />

                <CardMetadata>
                  <div className="flex items-center gap-3 text-xs text-theme-muted">
                    <time dateTime={link.capturedAt}>
                      Captured {formatDate(link.capturedAt)}
                    </time>
                    {link.source.type === "conversation" && (
                      <>
                        <span>•</span>
                        <a
                          href={`/summaries/${link.source.slug}`}
                          className="text-brand hover:text-brand-dark"
                        >
                          {link.source.title}
                        </a>
                      </>
                    )}
                  </div>
                </CardMetadata>
              </div>

              <div className="flex-shrink-0">
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-theme-muted text-theme hover:bg-brand hover:text-theme-inverse transition-colors"
                  aria-label={`Open ${link.title} in new tab`}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </a>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {links.length === 0 && (
        <EmptyState
          message="No links captured yet."
          description="Links will appear here as they are captured from conversations or added manually."
        />
      )}
    </div>
  );
};
