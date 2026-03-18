import type { JSX } from "preact";
import type { PersonalProfile } from "../schemas";
import type { EnrichedBlogPost } from "@brains/blog";
import type { SiteInfoCTA } from "@brains/site-builder-plugin";
import { ContentSection, type ContentItem, Head } from "@brains/ui-library";
import { CTASection } from "../components/CTASection";

export interface HomepageData {
  profile: PersonalProfile;
  posts: EnrichedBlogPost[];
  postsListUrl: string;
  cta: SiteInfoCTA;
}

export const HomepageLayout = ({
  profile,
  posts,
  postsListUrl,
  cta,
}: HomepageData): JSX.Element => {
  const tagline = profile.tagline || profile.description;

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

  return (
    <>
      <Head
        title={profile.name || "Home"}
        description={profile.description || tagline || "Personal site"}
        ogType="website"
      />

      {/* Hero */}
      <header className="hero-bg-pattern relative w-full py-16 md:py-24 px-6 md:px-12 bg-theme overflow-hidden">
        <div className="relative z-10 max-w-4xl mx-auto text-center">
          {tagline && (
            <h1 className="text-3xl md:text-5xl font-bold text-brand mb-4 font-heading tracking-tight">
              {tagline}
            </h1>
          )}
          {profile.description && (
            <p className="text-base md:text-lg text-theme max-w-xl mx-auto mb-8">
              {profile.description}
            </p>
          )}
        </div>
      </header>

      {/* Recent Posts */}
      {postItems.length > 0 && (
        <ContentSection
          title="Recent Posts"
          items={postItems}
          viewAllUrl={postsListUrl}
        />
      )}

      {/* CTA */}
      <CTASection
        heading={cta.heading}
        buttonText={cta.buttonText}
        buttonLink={cta.buttonLink}
      />
    </>
  );
};
