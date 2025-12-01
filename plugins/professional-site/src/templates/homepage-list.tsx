import type { JSX } from "preact";
import type { ProfessionalProfile } from "../schemas";
import type { EnrichedBlogPost } from "@brains/blog";
import type { EnrichedDeck } from "@brains/decks";
import { ContentSection, type ContentItem, Head } from "@brains/ui-library";
import { WavyDivider } from "../components/WavyDivider";

/**
 * Homepage data structure
 * After site-builder enrichment, posts and decks will have url and typeLabel fields
 */
export interface HomepageListData {
  profile: ProfessionalProfile;
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

  // Map posts to ContentItem format
  const postItems: ContentItem[] = posts.map((post) => ({
    id: post.id,
    url: post.url,
    title: post.metadata.title,
    date: post.metadata.publishedAt || post.created,
    description: post.frontmatter.excerpt,
  }));

  // Map decks to ContentItem format
  const deckItems: ContentItem[] = decks.map((deck) => ({
    id: deck.id,
    url: deck.url,
    title: deck.title || deck.id,
    date: deck.presentedAt ?? deck.created,
    description: deck.description,
  }));

  const title = profile.name || "Home";
  const description =
    profile.intro || profile.description || tagline || "Professional site";

  return (
    <>
      <Head title={title} description={description} />
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
          <div className="mb-20 md:mb-32">
            <ContentSection
              title="Essays"
              items={postItems}
              viewAllUrl={postsListUrl}
            />
          </div>

          {/* Presentations Section */}
          {deckItems.length > 0 && (
            <div className="mb-20 md:mb-32">
              <ContentSection
                title="Presentations"
                items={deckItems}
                viewAllUrl={decksListUrl}
              />
            </div>
          )}

          {/* About Section */}
          {(profile.description ||
            (profile.expertise && profile.expertise.length > 0)) && (
            <ContentSection title="About" viewAllUrl="/about">
              <div className="space-y-6">
                {profile.description && (
                  <p className="text-lg text-theme leading-relaxed">
                    {profile.description}
                  </p>
                )}
                {profile.expertise && profile.expertise.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {profile.expertise.map((skill, i) => (
                      <span
                        key={i}
                        className="px-3 py-1 bg-accent/10 text-accent rounded-full text-sm"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </ContentSection>
          )}
        </div>
      </div>
    </>
  );
};
