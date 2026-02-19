import type { JSX } from "preact";
import type { ProfessionalProfile } from "../schemas";
import type { EnrichedBlogPost } from "@brains/blog";
import type { EnrichedDeck } from "@brains/decks";
import type { SiteInfoCTA } from "@brains/site-builder-plugin";
import {
  AnimatedWaveDivider,
  ContentSection,
  type ContentItem,
  Head,
  TagsList,
} from "@brains/ui-library";
import { CTASection } from "../components/CTASection";

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
  cta: SiteInfoCTA;
}

/**
 * Minimal, clean homepage layout
 * Two-zone hero with asymmetric composition, varied section widths
 */
export const HomepageListLayout = ({
  profile,
  posts,
  decks,
  postsListUrl,
  decksListUrl,
  cta,
}: HomepageListData): JSX.Element => {
  // Use tagline if available, fall back to description
  const tagline = profile.tagline || profile.description;

  // Map posts to ContentItem format with series badges
  const postItems: ContentItem[] = posts.map((post) => ({
    id: post.id,
    url: post.url,
    title: post.metadata.title,
    date: post.metadata.publishedAt || post.created,
    description: post.frontmatter.excerpt,
    series:
      post.frontmatter.seriesName && post.frontmatter.seriesIndex
        ? {
            name: post.frontmatter.seriesName,
            index: post.frontmatter.seriesIndex,
          }
        : undefined,
  }));

  // Map decks to ContentItem format
  const deckItems: ContentItem[] = decks.map((deck) => ({
    id: deck.id,
    url: deck.url,
    title: deck.title || deck.id,
    date: deck.publishedAt ?? deck.created,
    description: deck.description,
  }));

  const title = profile.name || "Home";
  const description =
    profile.intro || profile.description || tagline || "Professional site";

  return (
    <>
      <Head title={title} description={description} ogType="website" />
      <div className="homepage-list bg-theme">
        {/* Hero Section — tall, spacious, asymmetric */}
        <header className="hero-bg-pattern relative w-full min-h-[70vh] flex items-end px-6 md:px-12 bg-theme overflow-hidden">
          <div className="relative z-10 max-w-6xl mx-auto w-full pb-16 md:pb-24">
            {tagline && (
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-semibold text-heading leading-[1.08] tracking-tight">
                {tagline}
              </h1>
            )}
            {profile.intro && (
              <>
                <div className="w-12 border-t border-theme mt-8 mb-6 md:mt-10 md:mb-8"></div>
                <p className="text-lg md:text-xl text-theme-muted leading-relaxed max-w-xl md:max-w-lg">
                  {profile.intro}
                </p>
              </>
            )}
          </div>
        </header>

        <AnimatedWaveDivider />

        {/* Main Content — Single shared container */}
        <div className="container mx-auto px-6 md:px-12 max-w-5xl py-16 md:py-24">
          {/* Essays Section */}
          <div className="content-section-reveal mb-20 md:mb-32">
            <ContentSection
              title="Essays"
              items={postItems}
              viewAllUrl={postsListUrl}
            />
          </div>

          {/* Presentations Section */}
          {deckItems.length > 0 && (
            <div className="content-section-reveal mb-20 md:mb-32">
              <ContentSection
                title="Presentations"
                items={deckItems}
                viewAllUrl={decksListUrl}
              />
            </div>
          )}

          {/* About Section — Stacked variant */}
          {(profile.description ||
            (profile.expertise && profile.expertise.length > 0)) && (
            <div className="content-section-reveal mb-20 md:mb-32">
              <ContentSection
                title="About"
                viewAllUrl="/about"
                variant="stacked"
              >
                <div className="space-y-6">
                  {profile.description && (
                    <p className="text-lg text-theme leading-relaxed">
                      {profile.description}
                    </p>
                  )}
                  {profile.expertise && profile.expertise.length > 0 && (
                    <TagsList
                      tags={profile.expertise}
                      variant="accent"
                      size="sm"
                    />
                  )}
                </div>
              </ContentSection>
            </div>
          )}
        </div>

        {/* CTA Section — Full-width */}
        <CTASection cta={cta} socialLinks={profile.socialLinks} />
      </div>
    </>
  );
};
