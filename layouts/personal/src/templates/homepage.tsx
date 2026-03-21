import type { JSX } from "preact";
import type { PersonalProfile } from "../schemas";
import type { EnrichedBlogPost } from "@brains/blog";
import type { SiteInfoCTA } from "@brains/site-builder-plugin";
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

export const HomepageLayout = ({
  profile,
  posts,
  postsListUrl,
  cta,
}: HomepageData): JSX.Element => {
  const tagline = profile.tagline ?? profile.description;

  return (
    <>
      <Head
        title={profile.name}
        description={profile.description ?? tagline ?? "Personal site"}
        ogType="website"
      />

      {/* Hero — gradient bg, centered, generous vertical padding */}
      <header className="flex flex-col items-center pt-20 pb-[60px] px-6 md:px-12 gap-5 bg-theme-gradient">
        <div className="max-w-[700px] mx-auto text-center">
          {tagline && (
            <h1 className="text-4xl md:text-[56px] md:leading-[1.1] font-bold text-brand mb-5 font-heading tracking-[-0.03em]">
              {tagline}
            </h1>
          )}
          {profile.description && (
            <p className="text-lg leading-[1.6] text-theme max-w-[520px] mx-auto mb-6">
              {profile.description}
            </p>
          )}
          <div className="flex justify-center gap-3">
            <a
              href={postsListUrl}
              className="rounded-full py-3.5 px-8 bg-brand text-theme-inverse font-bold text-[15px] hover:bg-brand-dark transition-colors"
            >
              Read the Blog
            </a>
            <a
              href="/about"
              className="rounded-full py-3.5 px-8 border-2 border-accent text-accent font-bold text-[15px] hover:bg-accent hover:text-theme-inverse transition-colors"
            >
              About {profile.name.split(" ")[0]}
            </a>
          </div>
        </div>
      </header>

      {/* Recent Posts — same bg as page, no contrast shift */}
      {posts.length > 0 && (
        <section className="flex flex-col py-[60px] px-6 md:px-12 gap-8 bg-theme">
          <div className="flex justify-between items-baseline max-w-layout mx-auto w-full">
            <h2 className="text-2xl md:text-[32px] font-bold text-heading font-heading">
              Recent Posts
            </h2>
            <a
              href={postsListUrl}
              className="text-brand font-semibold text-sm hover:text-brand-dark transition-colors"
            >
              View all →
            </a>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-layout mx-auto w-full">
            {posts.map((post) => (
              <a
                key={post.id}
                href={post.url}
                className="flex flex-col rounded-[20px] gap-4 bg-white border border-theme p-6 hover:shadow-lg transition-shadow no-underline"
              >
                {post.coverImageUrl ? (
                  <img
                    src={post.coverImageUrl}
                    alt={post.metadata.title}
                    className="w-full h-40 rounded-[14px] object-cover shrink-0"
                  />
                ) : (
                  <div className="w-full h-40 rounded-[14px] shrink-0 card-cover-gradient" />
                )}
                {post.frontmatter.seriesName && (
                  <div className="flex gap-2">
                    <span className="rounded-full py-0.5 px-2.5 bg-bg-muted text-brand text-[11px] font-semibold leading-[14px]">
                      {post.frontmatter.seriesName}
                    </span>
                  </div>
                )}
                <h3 className="text-heading font-heading font-bold text-xl leading-6">
                  {post.metadata.title}
                </h3>
                {post.frontmatter.excerpt && (
                  <p className="text-sm text-theme-muted leading-[1.5]">
                    {post.frontmatter.excerpt}
                  </p>
                )}
                <span className="text-theme-light text-xs leading-4">
                  {formatDate(post.metadata.publishedAt ?? post.created)}
                </span>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* CTA — brand bg with subtitle and pill button */}
      <section className="flex flex-col items-center py-[60px] px-6 md:px-12 gap-4 bg-brand">
        <h2 className="text-center text-theme-inverse font-heading font-bold text-2xl md:text-[28px]">
          {cta.heading}
        </h2>
        {cta.subtitle && (
          <p className="text-center text-cta-subtitle text-base max-w-[400px]">
            {cta.subtitle}
          </p>
        )}
        <a
          href={cta.buttonLink}
          className="rounded-full py-3.5 px-8 bg-white text-brand font-bold text-[15px] hover:bg-theme-subtle transition-colors"
        >
          {cta.buttonText}
        </a>
      </section>
    </>
  );
};
