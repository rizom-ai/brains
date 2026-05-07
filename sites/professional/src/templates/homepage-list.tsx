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
  "grid md:grid-cols-[14rem_1px_1fr] gap-y-2 gap-x-0 md:gap-16 items-start";
const RULE_CLS =
  "border-t md:border-t-0 md:border-l border-rule-strong md:self-stretch";

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
  <section className="py-20 border-b border-rule px-6 md:px-12">
    <div className="max-w-6xl mx-auto">
      <div className={GRID_CLS}>
        <SectionHeader title={title} number={number} blurb={blurb} />
        <div className={RULE_CLS} aria-hidden="true" />
        <div className="mt-6 md:mt-0">{children}</div>
      </div>
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
        <header className="hero-bg-pattern relative w-full px-6 md:px-12 pt-28 pb-24 md:pt-28 md:pb-24 overflow-hidden border-b border-rule">
          <div className="relative z-10 max-w-6xl mx-auto w-full">
            {profile.name && (
              <div className="flex items-center gap-[0.6rem] mb-6 font-mono text-[0.7rem] font-medium uppercase tracking-[0.22em] text-accent">
                <span className="w-[18px] h-px bg-accent" aria-hidden="true" />
                <span>{profile.name}</span>
              </div>
            )}
            {tagline && (
              <h1 className="font-heading text-[clamp(2.75rem,6.5vw,5.5rem)] font-normal text-heading leading-[1.02] tracking-[-0.025em] max-w-[18ch] [font-variation-settings:'opsz'_144,'SOFT'_30]">
                {renderHighlightedText(
                  tagline,
                  "italic font-normal text-accent [font-variation-settings:'opsz'_144,'SOFT'_80]",
                )}
              </h1>
            )}
            {profile.intro && (
              <p className="font-heading font-light text-[clamp(1.1rem,1.8vw,1.4rem)] leading-[1.5] text-theme-muted max-w-[42ch] mt-8 [font-variation-settings:'opsz'_24]">
                {renderHighlightedText(profile.intro, "italic text-accent")}
              </p>
            )}
          </div>
        </header>

        <EditorialRow
          number="01"
          title="Essays"
          blurb={sections["essays"]?.blurb}
        >
          <ContentList
            items={postItems}
            viewAllUrl={postsListUrl}
            viewAllLabel="View all essays"
          />
        </EditorialRow>

        {deckItems.length > 0 && (
          <EditorialRow
            number="02"
            title="Presentations"
            blurb={sections["presentations"]?.blurb}
          >
            <ContentList
              items={deckItems}
              viewAllUrl={decksListUrl}
              viewAllLabel="View all presentations"
            />
          </EditorialRow>
        )}

        {hasAbout && (
          <EditorialRow
            number="03"
            title="About"
            blurb={sections["about"]?.blurb}
          >
            <div className="flex flex-col gap-8">
              {profile.description && (
                <p className="font-heading font-light text-[1.25rem] leading-[1.55] text-theme max-w-[55ch] [font-variation-settings:'opsz'_24,'SOFT'_50]">
                  {profile.description}
                </p>
              )}
              {profile.expertise && profile.expertise.length > 0 && (
                <SubjectsList subjects={profile.expertise} />
              )}
              <a
                href="/about"
                className="mt-6 inline-flex items-center gap-2 font-mono text-[0.7rem] font-medium uppercase tracking-[0.18em] text-accent pb-1 relative before:content-[''] before:absolute before:left-0 before:right-full before:bottom-0 before:h-px before:bg-accent before:transition-[right] before:duration-300 hover:before:right-0"
              >
                Learn more
                <span aria-hidden="true">→</span>
              </a>
            </div>
          </EditorialRow>
        )}

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
