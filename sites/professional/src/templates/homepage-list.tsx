import type { JSX, ComponentChildren } from "preact";
import type { ProfessionalProfile } from "../schemas";
import type { EnrichedBlogPost } from "@brains/blog";
import type { EnrichedDeck } from "@brains/decks";
import type { SiteInfoCTA } from "@brains/site-info";
import {
  ContentList,
  CTASection,
  type ContentItem,
  Head,
  SectionHeader,
  SubjectsList,
  renderHighlightedText,
} from "@brains/ui-library";

/**
 * Per-section blurb metadata, keyed by section id (e.g. essays,
 * presentations, about). Comes from siteInfo.sections — users can edit
 * via the CMS.
 */
type HomepageSections = Record<string, { blurb?: string }>;

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
  sections: HomepageSections;
}

const GRID_CLS =
  "grid md:grid-cols-[200px_1px_1fr] gap-y-2 gap-x-0 md:gap-12 items-start";
const RULE_CLS =
  "border-t md:border-t-0 md:border-l border-theme md:self-stretch";

const EditorialRow = ({
  number,
  title,
  blurb,
  children,
}: {
  number: string;
  title: string;
  blurb?: string | undefined;
  children: ComponentChildren;
}): JSX.Element => (
  <section>
    <div className={GRID_CLS}>
      <SectionHeader title={title} number={number} blurb={blurb} />
      <div className={RULE_CLS} aria-hidden="true" />
      <div className="mt-6 md:mt-0">{children}</div>
    </div>
  </section>
);

/**
 * Editorial homepage — restrained hero, three numbered sections (Essays,
 * Presentations, About) with optional CMS-driven blurbs, full-width CTA.
 */
export const HomepageListLayout = ({
  profile,
  posts,
  decks,
  postsListUrl,
  decksListUrl,
  cta,
  sections,
}: HomepageListData): JSX.Element => {
  // Use tagline if available, fall back to description
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

  const deckItems: ContentItem[] = decks.map((deck) => ({
    id: deck.id,
    url: deck.url,
    title: deck.frontmatter.title || deck.id,
    date: deck.frontmatter.publishedAt ?? deck.created,
    description: deck.frontmatter.description,
  }));

  const title = profile.name || "Home";
  const description =
    profile.intro || profile.description || tagline || "Professional site";

  const hasAbout =
    Boolean(profile.description) ||
    (profile.expertise !== undefined && profile.expertise.length > 0);

  return (
    <>
      <Head title={title} description={description} ogType="website" />
      <div className="homepage-list bg-theme">
        {/* Hero Section — restrained editorial */}
        <header className="hero-bg-pattern relative w-full px-6 md:px-12 py-24 md:py-32 bg-theme overflow-hidden">
          <div className="relative z-10 max-w-6xl mx-auto w-full">
            {profile.name && (
              <div className="flex items-center gap-3 mb-6 font-mono text-xs font-medium uppercase tracking-[0.22em] text-accent">
                <span className="w-5 h-px bg-accent" aria-hidden="true" />
                <span>{profile.name}</span>
              </div>
            )}
            {tagline && (
              <h1 className="font-heading text-[clamp(2.85rem,6.4vw,5.5rem)] font-normal text-heading leading-[1.02] tracking-[-0.025em] max-w-[16ch]">
                {renderHighlightedText(
                  tagline,
                  "italic font-normal text-accent [font-variation-settings:'opsz'_144,'SOFT'_100]",
                )}
              </h1>
            )}
            {profile.intro && (
              <p className="font-heading font-light text-[clamp(1.1rem,1.8vw,1.4rem)] leading-[1.5] text-theme-muted max-w-[42ch] mt-8">
                {renderHighlightedText(profile.intro, "italic text-accent")}
              </p>
            )}
          </div>
        </header>

        <div className="section-divider" />

        {/* Main Content — Single shared container */}
        <div className="container mx-auto px-6 md:px-12 max-w-5xl py-16 md:py-24">
          {/* Essays */}
          <div className="content-section-reveal mb-20 md:mb-32">
            <EditorialRow
              number="01"
              title="Essays"
              blurb={sections["essays"]?.blurb}
            >
              <ContentList
                items={postItems}
                viewAllUrl={postsListUrl}
                viewAllLabel="View All Essays →"
              />
            </EditorialRow>
          </div>

          {/* Presentations */}
          {deckItems.length > 0 && (
            <div className="content-section-reveal mb-20 md:mb-32">
              <EditorialRow
                number="02"
                title="Presentations"
                blurb={sections["presentations"]?.blurb}
              >
                <ContentList
                  items={deckItems}
                  viewAllUrl={decksListUrl}
                  viewAllLabel="View All Presentations →"
                />
              </EditorialRow>
            </div>
          )}

          {/* About */}
          {hasAbout && (
            <div className="content-section-reveal mb-20 md:mb-32">
              <EditorialRow
                number="03"
                title="About"
                blurb={sections["about"]?.blurb}
              >
                <div className="space-y-8">
                  {profile.description && (
                    <p className="font-heading font-light text-[clamp(1.2rem,1.8vw,1.45rem)] leading-[1.5] text-theme max-w-[55ch]">
                      {profile.description}
                    </p>
                  )}
                  {profile.expertise && profile.expertise.length > 0 && (
                    <SubjectsList subjects={profile.expertise} />
                  )}
                  <a
                    href="/about"
                    className="inline-flex items-center gap-2 mt-6 font-mono text-xs font-medium uppercase tracking-[0.18em] text-accent relative pb-1 before:content-[''] before:absolute before:left-0 before:right-full before:bottom-0 before:h-px before:bg-accent before:transition-[right] before:duration-300 hover:before:right-0"
                  >
                    Read full bio →
                  </a>
                </div>
              </EditorialRow>
            </div>
          )}
        </div>

        {/* CTA Section — Full-width */}
        <CTASection
          cta={cta}
          variant="editorial"
          socialLinks={profile.socialLinks}
        />
      </div>
    </>
  );
};
