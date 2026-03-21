import type { JSX } from "preact";
import type { PersonalProfile } from "../schemas";
import type { EnrichedBlogPost } from "@brains/blog";
import type { SiteInfoCTA } from "@brains/site-builder-plugin";
import { Head } from "@brains/ui-library";

export interface HomepageData {
  profile: PersonalProfile;
  posts: EnrichedBlogPost[];
  postsListUrl: string;
  cta: SiteInfoCTA;
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
        title={profile.name || "Home"}
        description={profile.description ?? tagline ?? "Personal site"}
        ogType="website"
      />

      {/* Hero */}
      <header className="flex flex-col items-center py-16 md:py-20 px-6 md:px-12 gap-5 bg-theme-gradient">
        <div className="max-w-4xl mx-auto text-center">
          {tagline && (
            <h1 className="text-4xl md:text-[56px] md:leading-tight font-bold text-brand mb-5 font-heading tracking-tight">
              {tagline}
            </h1>
          )}
          {profile.description && (
            <p className="text-lg text-theme max-w-xl mx-auto mb-6">
              {profile.description}
            </p>
          )}
          <div className="flex justify-center gap-3">
            <a
              href={postsListUrl}
              className="rounded-full py-3.5 px-8 bg-brand text-theme-inverse font-bold text-sm hover:bg-brand-dark transition-colors"
            >
              Read the Blog
            </a>
            <a
              href="/about"
              className="rounded-full py-3.5 px-8 border-2 border-accent text-accent font-bold text-sm hover:bg-accent hover:text-theme-inverse transition-colors"
            >
              About {profile.name.split(" ")[0]}
            </a>
          </div>
        </div>
      </header>

      {/* Recent Posts */}
      {posts.length > 0 && (
        <section className="flex flex-col py-12 md:py-16 px-6 md:px-12 gap-8 bg-theme-subtle">
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
                className="flex flex-col rounded-2xl gap-4 bg-theme border border-theme p-6 hover:shadow-lg transition-shadow no-underline"
              >
                {post.coverImageUrl && (
                  <img
                    src={post.coverImageUrl}
                    alt={post.metadata.title}
                    className="w-full h-40 rounded-xl object-cover"
                  />
                )}
                <h3 className="text-heading font-heading font-bold text-xl leading-tight">
                  {post.metadata.title}
                </h3>
                {post.frontmatter.excerpt && (
                  <p className="text-sm text-theme-muted leading-relaxed">
                    {post.frontmatter.excerpt}
                  </p>
                )}
                <span className="text-theme-light text-xs">
                  {formatDate(post.metadata.publishedAt ?? post.created)}
                </span>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="flex flex-col items-center py-12 md:py-16 px-6 md:px-12 gap-4 bg-brand">
        <h2 className="text-center text-theme-inverse font-heading font-bold text-2xl md:text-[28px]">
          {cta.heading}
        </h2>
        <a
          href={cta.buttonLink}
          className="rounded-full py-3.5 px-8 bg-theme text-brand font-bold text-sm hover:bg-theme-subtle transition-colors"
        >
          {cta.buttonText}
        </a>
      </section>
    </>
  );
};
