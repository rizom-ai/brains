import type { JSX } from "preact";
import type { PersonalProfile } from "../schemas";
import type { EnrichedBlogPost } from "@brains/blog";
import type { SiteInfoCTA } from "@brains/site-info";
import { Head } from "@brains/ui-library";

export interface HomepageData {
  profile: PersonalProfile;
  posts: EnrichedBlogPost[];
  postsListUrl: string;
  cta: SiteInfoCTA & { subtitle?: string };
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Parse `*foo*` markers in a tagline and render the wrapped span as an
 * italic accent at max optical size.
 * Plain taglines without markers render unchanged.
 */
function renderTagline(tagline: string): (string | JSX.Element)[] {
  return tagline.split(/(\*[^*]+\*)/).map((part, i) => {
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return (
        <em
          key={i}
          className="font-sans italic font-medium text-theme-inverse tracking-[-0.015em] [font-variation-settings:'opsz'_72]"
        >
          {part.slice(1, -1)}
        </em>
      );
    }
    return part;
  });
}

export const HomepageLayout = ({
  profile,
  posts,
  postsListUrl,
  cta,
}: HomepageData): JSX.Element => {
  const tagline = profile.tagline ?? profile.description;
  const firstName = profile.name.split(" ")[0];

  return (
    <>
      <Head
        title={profile.name}
        description={profile.description ?? tagline ?? "Personal site"}
        ogType="website"
      />

      {/* HERO — brand surface, inverse ink, halo + grain.
          The H1 carries the design; one bold typographic move. */}
      <header className="hero-decor bg-brand text-theme-inverse relative flex flex-col items-center justify-center px-6 md:px-12 pt-32 pb-24 gap-7">
        <div className="w-full max-w-[1100px] mx-auto text-center flex flex-col items-center gap-7">
          {tagline && (
            <h1 className="font-heading font-bold text-[clamp(2.5rem,6vw,5rem)] leading-[1.05] tracking-[-0.035em] text-theme-inverse text-balance m-0 [font-variation-settings:'wdth'_90,'opsz'_96]">
              {renderTagline(tagline)}
            </h1>
          )}

          {profile.description && (
            <p className="text-[clamp(1.0625rem,1.4vw,1.3125rem)] leading-[1.5] text-theme-inverse opacity-95 max-w-[600px] mx-auto m-0">
              {profile.description}
            </p>
          )}

          <div className="flex flex-wrap justify-center gap-3.5 mt-2">
            <a
              href={postsListUrl}
              className="inline-flex items-center gap-2 rounded-full py-3.5 px-7 bg-theme text-brand border-2 border-theme font-heading font-semibold text-[15px] hover:bg-theme-subtle hover:-translate-y-0.5 transition-all [font-variation-settings:'wdth'_92,'opsz'_18]"
            >
              Read the Blog <span aria-hidden="true">→</span>
            </a>
            <a
              href="/about"
              className="rounded-full py-3.5 px-7 border-2 border-theme-light text-theme-inverse font-heading font-semibold text-[15px] hover:bg-brand-dark hover:border-theme hover:-translate-y-0.5 transition-all [font-variation-settings:'wdth'_92,'opsz'_18]"
            >
              About {firstName}
            </a>
          </div>
        </div>
      </header>

      {/* RECENT POSTS — soft theme surface, editorial cards with cover images. */}
      {posts.length > 0 && (
        <section className="flex flex-col py-24 px-6 md:px-12 gap-11 bg-theme-subtle">
          <div className="flex justify-between items-end max-w-layout mx-auto w-full gap-6 flex-wrap">
            <div>
              <span className="block font-heading font-semibold text-[13px] uppercase tracking-[0.22em] text-brand mb-3 [font-variation-settings:'wdth'_85,'opsz'_12]">
                The Archive
              </span>
              <h2 className="font-heading font-bold text-[clamp(2.25rem,5vw,3.75rem)] leading-none tracking-[-0.03em] text-heading m-0 [font-variation-settings:'wdth'_92,'opsz'_64]">
                Recent{" "}
                <em className="font-sans italic font-medium text-brand [font-variation-settings:'opsz'_60]">
                  posts
                </em>
              </h2>
            </div>
            <a
              href={postsListUrl}
              className="font-heading font-semibold text-[15px] text-brand inline-flex items-center gap-1.5 pb-1.5 border-b-2 border-current hover:text-brand-dark transition-colors [font-variation-settings:'wdth'_88,'opsz'_16]"
            >
              View the whole archive <span aria-hidden="true">→</span>
            </a>
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-8 max-w-layout mx-auto w-full">
            {posts.map((post) => (
              <a
                key={post.id}
                href={post.url}
                className="group flex flex-col bg-theme border border-theme rounded-md overflow-hidden hover:-translate-y-1 hover:border-brand/50 transition-all no-underline shadow-sm hover:shadow-lg"
              >
                {post.coverImageUrl ? (
                  <img
                    src={post.coverImageUrl}
                    alt={post.metadata.title}
                    className="w-full aspect-[16/10] object-cover bg-theme-muted"
                  />
                ) : (
                  <div
                    className="w-full aspect-[16/10] bg-gradient-to-br from-brand to-accent"
                    aria-hidden="true"
                  />
                )}
                <div className="flex flex-col gap-4 p-7 flex-1">
                  <div className="flex flex-wrap items-center gap-3.5 font-heading text-[11px] font-semibold uppercase tracking-[0.18em] text-theme-muted [font-variation-settings:'wdth'_85,'opsz'_11]">
                    {post.frontmatter.seriesName && (
                      <>
                        <span className="text-brand">
                          {post.frontmatter.seriesName}
                        </span>
                        <span
                          className="w-[3px] h-[3px] rounded-full bg-current opacity-50"
                          aria-hidden="true"
                        />
                      </>
                    )}
                    <time>
                      {formatDate(post.metadata.publishedAt ?? post.created)}
                    </time>
                  </div>
                  <h3 className="font-sans font-semibold text-[clamp(1.375rem,1.8vw,1.625rem)] leading-[1.18] tracking-[-0.012em] text-heading m-0 text-balance">
                    {post.metadata.title}
                  </h3>
                  {post.frontmatter.excerpt && (
                    <p className="text-base leading-[1.55] text-theme-muted m-0 flex-1">
                      {post.frontmatter.excerpt}
                    </p>
                  )}
                  <span className="inline-flex items-center gap-1.5 font-heading font-semibold text-[13px] uppercase tracking-[0.14em] text-brand mt-1 [font-variation-settings:'wdth'_88,'opsz'_14]">
                    Read the post{" "}
                    <span
                      aria-hidden="true"
                      className="transition-transform group-hover:translate-x-1"
                    >
                      →
                    </span>
                  </span>
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* CTA — dark theme bookend with the hero. `flex-grow` consumes any
          leftover viewport space so the footer sits flush at the bottom. */}
      <section className="cta-decor bg-theme-dark text-theme-on-dark flex-grow flex flex-col items-center justify-center py-24 px-6 md:px-12 gap-5">
        <span className="font-heading font-medium text-xs uppercase tracking-[0.24em] text-accent [font-variation-settings:'wdth'_85,'opsz'_12]">
          Get in touch
        </span>
        <h2 className="text-center font-heading font-bold text-[clamp(2rem,4vw,3rem)] leading-none tracking-[-0.03em] text-theme-on-dark m-0 [font-variation-settings:'wdth'_90,'opsz'_64]">
          {cta.heading}
        </h2>
        {cta.subtitle && (
          <p className="text-center text-base leading-[1.55] text-theme-on-dark opacity-80 max-w-[480px] m-0">
            {cta.subtitle}
          </p>
        )}
        <a
          href={cta.buttonLink}
          className="inline-flex items-center gap-2 rounded-full py-3.5 px-7 bg-brand text-theme-inverse border-2 border-brand font-heading font-semibold text-[15px] hover:bg-brand-dark hover:-translate-y-0.5 transition-all mt-2 [font-variation-settings:'wdth'_92,'opsz'_18]"
        >
          {cta.buttonText} <span aria-hidden="true">→</span>
        </a>
      </section>
    </>
  );
};
