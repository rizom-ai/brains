import type { JSX } from "preact";
import type { PersonalProfile } from "../schemas";
import { Head, ProseContent, LinkButton } from "@brains/ui-library";

export interface AboutPageData {
  profile: PersonalProfile;
  storyHtml?: string | undefined;
}

export const AboutPageLayout = ({
  profile,
  storyHtml,
}: AboutPageData): JSX.Element => {
  const title = `About ${profile.name}`;
  const description = profile.description ?? profile.intro ?? "About page";

  return (
    <>
      <Head title={title} description={description} ogType="profile" />
      <div className="about-page bg-theme">
        {/* Hero */}
        <header className="hero-bg-pattern relative w-full py-16 md:py-24 px-6 md:px-12 bg-theme overflow-hidden">
          <div className="relative z-10 max-w-4xl mx-auto">
            <h1 className="text-3xl md:text-5xl font-bold text-brand mb-4 font-heading tracking-tight">
              {profile.name}
            </h1>
            {profile.description && (
              <p className="text-base md:text-lg text-muted max-w-2xl">
                {profile.description}
              </p>
            )}
          </div>
        </header>

        {/* Story */}
        {storyHtml && (
          <section className="py-12 md:py-16 px-6 md:px-12 bg-theme">
            <div className="max-w-3xl mx-auto">
              <ProseContent html={storyHtml} />
            </div>
          </section>
        )}

        {/* Contact */}
        {(profile.email ?? profile.website) && (
          <section className="py-12 md:py-16 px-6 md:px-12 bg-theme">
            <div className="max-w-3xl mx-auto flex flex-wrap gap-4">
              {profile.email && (
                <LinkButton href={`mailto:${profile.email}`} variant="primary">
                  Get in Touch
                </LinkButton>
              )}
              {profile.website && (
                <LinkButton href={profile.website} variant="outline">
                  Website
                </LinkButton>
              )}
            </div>
          </section>
        )}
      </div>
    </>
  );
};
