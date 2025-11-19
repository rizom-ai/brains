import type { JSX } from "preact";
import type { ProfileBody } from "@brains/profile-service";
import type { EnrichedBlogPost } from "@brains/blog";
import type { EnrichedDeck } from "@brains/decks";
import { WavyDivider } from "../components/WavyDivider";
import { CompactFooter } from "../components/CompactFooter";

/**
 * Homepage data structure
 * After site-builder enrichment, posts and decks will have url and typeLabel fields
 */
export interface HomepageListData {
  profile: ProfileBody;
  posts: EnrichedBlogPost[];
  decks: EnrichedDeck[];
  postsListUrl: string;
  decksListUrl: string;
}

/**
 * Minimal, clean homepage layout
 * Displays profile intro, essays list, and presentations list in separate sections
 */
export const HomepageListLayout = ({
  profile,
  posts,
  decks,
  postsListUrl,
  decksListUrl,
}: HomepageListData): JSX.Element => {
  // Use tagline if available, fall back to description
  const tagline = profile.tagline || profile.description;

  return (
    <div className="homepage-list bg-theme">
      {/* Full-width Hero Section */}
      <header className="w-full py-24 md:py-40 px-6 md:px-12 bg-theme">
        <div className="max-w-6xl mx-auto">
          {tagline && (
            <h1 className="text-6xl md:text-7xl font-semibold mb-4 text-heading leading-tight max-w-4xl">
              {tagline}
            </h1>
          )}
          {profile.intro && (
            <p className="text-xl md:text-2xl text-theme-muted leading-relaxed max-w-3xl">
              {profile.intro}
            </p>
          )}
        </div>
      </header>

      <WavyDivider />

      {/* Main Content - Single Column with Header-Left Layout */}
      <div className="container mx-auto px-6 md:px-12 max-w-4xl py-16 md:py-24">
        {/* Essays Section */}
        <section className="mb-20 md:mb-32">
          <div className="grid md:grid-cols-[200px_1px_1fr] gap-8 md:gap-12 items-start">
            <h2 className="text-xl md:text-2xl font-semibold text-heading">
              Essays
            </h2>
            <div className="hidden md:block w-px bg-border h-full min-h-[400px]"></div>
            <div>
              {posts.length === 0 ? (
                <p className="text-theme-muted italic">No essays yet.</p>
              ) : (
                <>
                  <ul className="space-y-10">
                    {posts.slice(0, 3).map((post) => (
                      <li key={post.id}>
                        <a href={post.url} className="group block">
                          <h3 className="text-lg font-medium mb-2 text-heading group-hover:underline">
                            {post.metadata.title}
                          </h3>
                          <time className="text-sm text-theme-muted block mb-3">
                            {new Date(
                              post.metadata.publishedAt || post.created,
                            ).toLocaleDateString("en-US", {
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            })}
                          </time>
                          {post.frontmatter.excerpt && (
                            <p className="text-sm text-theme-muted leading-relaxed">
                              {post.frontmatter.excerpt}
                            </p>
                          )}
                        </a>
                      </li>
                    ))}
                  </ul>
                  {posts.length > 3 && (
                    <div className="mt-10">
                      <a
                        href={postsListUrl}
                        className="text-sm font-medium text-brand hover:text-brand-dark uppercase tracking-wide"
                      >
                        View All Essays →
                      </a>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </section>

        {/* Presentations Section */}
        {decks.length > 0 && (
          <section>
            <div className="grid md:grid-cols-[200px_1px_1fr] gap-8 md:gap-12 items-start">
              <h2 className="text-xl md:text-2xl font-semibold text-heading">
                Presentations
              </h2>
              <div className="hidden md:block w-px bg-border h-full min-h-[400px]"></div>
              <div>
                <>
                  <ul className="space-y-10">
                    {decks.slice(0, 3).map((deck) => {
                      return (
                        <li key={deck.id}>
                          <a href={deck.url} className="group block">
                            <h3 className="text-lg font-medium mb-2 text-heading group-hover:underline">
                              {deck.title || deck.id}
                            </h3>
                            <time className="text-sm text-theme-muted block mb-3">
                              {new Date(
                                deck.updated || deck.created,
                              ).toLocaleDateString("en-US", {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              })}
                            </time>
                            {deck.description && (
                              <p className="text-sm text-theme-muted leading-relaxed">
                                {deck.description}
                              </p>
                            )}
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                  {decks.length > 3 && (
                    <div className="mt-10">
                      <a
                        href={decksListUrl}
                        className="text-sm font-medium text-brand hover:text-brand-dark uppercase tracking-wide"
                      >
                        View All Presentations →
                      </a>
                    </div>
                  )}
                </>
              </div>
            </div>
          </section>
        )}
      </div>

      <CompactFooter
        copyright={
          profile.name
            ? `© ${new Date().getFullYear()} ${profile.name}`
            : undefined
        }
        socialLinks={profile.socialLinks}
      />
    </div>
  );
};
