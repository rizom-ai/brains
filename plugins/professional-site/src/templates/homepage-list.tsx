import type { JSX } from "preact";
import type { ProfileBody } from "@brains/profile-service";
import type { BlogPost } from "@brains/blog";
import type { DeckEntity } from "@brains/decks";

/**
 * Homepage data structure
 */
export interface HomepageListData {
  profile: ProfileBody;
  posts: BlogPost[];
  decks: DeckEntity[];
}

/**
 * Minimal, clean homepage layout inspired by Ben Evans
 * Displays profile intro, essays list, and presentations list in separate sections
 */
export const HomepageListLayout = ({
  profile,
  posts,
  decks,
}: HomepageListData): JSX.Element => {
  // Use tagline if available, fall back to description
  const tagline = profile.tagline || profile.description;

  return (
    <div className="homepage-list flex-grow min-h-screen bg-theme">
      <div className="container mx-auto px-6 md:px-8 max-w-3xl py-12 md:py-20">
        {/* Header Section */}
        <header className="mb-16">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 text-heading">
            {profile.name}
          </h1>
          {tagline && (
            <p className="text-xl md:text-2xl text-theme-muted mb-4">
              {tagline}
            </p>
          )}
          {profile.intro && (
            <p className="text-lg text-theme-muted">{profile.intro}</p>
          )}
        </header>

        {/* Essays Section */}
        <section className="mb-16">
          <h2 className="text-2xl font-semibold mb-8 text-heading">Essays</h2>
          {posts.length === 0 ? (
            <p className="text-theme-muted italic">No essays yet.</p>
          ) : (
            <ul className="space-y-6">
              {posts.map((post) => (
                <li key={post.id} className="border-b border-border pb-6">
                  <a
                    href={`/posts/${post.metadata.slug}`}
                    className="group block hover:opacity-80 transition-opacity"
                  >
                    <h3 className="text-xl font-medium mb-2 text-brand group-hover:underline">
                      {post.metadata.title}
                    </h3>
                    <time className="text-sm text-theme-muted mb-2 block">
                      {new Date(
                        post.metadata.publishedAt || post.created,
                      ).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </time>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Presentations Section */}
        {decks.length > 0 && (
          <section>
            <h2 className="text-2xl font-semibold mb-8 text-heading">
              Presentations
            </h2>
            <ul className="space-y-6">
              {decks.map((deck) => {
                return (
                  <li key={deck.id} className="border-b border-border pb-6">
                    <a
                      href={`/decks/${deck.id}`}
                      className="group block hover:opacity-80 transition-opacity"
                    >
                      <h3 className="text-xl font-medium mb-2 text-brand group-hover:underline">
                        {deck.title || deck.id}
                      </h3>
                      <time className="text-sm text-theme-muted mb-2 block">
                        {new Date(
                          deck.updated || deck.created,
                        ).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </time>
                      {deck.description && (
                        <p className="text-theme-muted leading-relaxed">
                          {deck.description}
                        </p>
                      )}
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
};
