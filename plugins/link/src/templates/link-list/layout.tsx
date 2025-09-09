import type { JSX } from "preact";
import type { LinkListData } from "./schema";

export const LinkListLayout = ({
  links,
  totalCount,
}: LinkListData): JSX.Element => {
  return (
    <div className="link-list-container max-w-4xl mx-auto p-6 bg-theme">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2 text-theme">Captured Links</h1>
        <p className="text-theme-muted">
          {totalCount} links captured from conversations and manual additions
        </p>
      </div>

      <div className="space-y-4">
        {links.map((link) => (
          <article
            key={link.id}
            className="link-card bg-theme-subtle rounded-lg p-5 hover:shadow-lg transition-shadow border border-theme"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold mb-1 truncate">
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand hover:text-brand-dark"
                  >
                    {link.title}
                  </a>
                </h2>

                <p className="text-sm text-theme-muted mb-2 truncate">
                  {link.domain}
                </p>

                <p className="text-theme mb-2 font-medium">
                  {link.description}
                </p>

                <p className="text-theme-muted mb-3 text-sm line-clamp-3">
                  {link.summary}
                </p>

                <div className="flex flex-wrap gap-2 mb-2">
                  {link.keywords.slice(0, 4).map((keyword) => (
                    <span
                      key={keyword}
                      className="px-2 py-1 text-xs bg-theme-muted rounded-full text-theme"
                    >
                      {keyword}
                    </span>
                  ))}
                  {link.keywords.length > 4 && (
                    <span className="px-2 py-1 text-xs text-theme-muted">
                      +{link.keywords.length - 4} more
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 text-xs text-theme-muted">
                  <time dateTime={link.capturedAt}>
                    Captured {new Date(link.capturedAt).toLocaleDateString()}
                  </time>
                  {link.conversationId && (
                    <>
                      <span>•</span>
                      <span className="text-xs" title={link.conversationId}>
                        {link.conversationId.startsWith("matrix-")
                          ? `Matrix: ${link.conversationId.slice(7, 20)}...`
                          : `Conv: ${link.conversationId.slice(0, 12)}...`}
                      </span>
                    </>
                  )}
                </div>
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
          </article>
        ))}
      </div>

      {links.length === 0 && (
        <div className="text-center py-12">
          <p className="text-theme-muted">No links captured yet.</p>
          <p className="text-sm text-theme-muted mt-2">
            Links will appear here as they are captured from conversations or
            added manually.
          </p>
        </div>
      )}
    </div>
  );
};
