import type { JSX } from "preact";
import type { PersonalProfile } from "../schemas";
import { Head, MarkdownContent } from "@brains/ui-library";

export interface AboutPageData {
  profile: PersonalProfile;
}

export const AboutPageLayout = ({ profile }: AboutPageData): JSX.Element => {
  const title = `About ${profile.name}`;
  const description = profile.description ?? profile.intro ?? "About page";
  const hasContact = Boolean(profile.email ?? profile.website);

  return (
    <>
      <Head title={title} description={description} ogType="profile" />

      {/* HERO — brand surface, inverse ink, halo + grain. */}
      <section className="hero-decor bg-brand text-theme-inverse relative flex flex-col px-6 md:px-12 pt-32 pb-24">
        <div className="w-full max-w-3xl mx-auto flex flex-col gap-6">
          <h1 className="font-heading font-bold text-[clamp(2.5rem,6vw,4.5rem)] leading-[1.05] tracking-[-0.035em] text-theme-inverse text-balance m-0 [font-variation-settings:'wdth'_90,'opsz'_96]">
            {profile.name}
          </h1>
          {profile.description && (
            <p className="text-[clamp(1.0625rem,1.4vw,1.25rem)] leading-[1.55] text-theme-inverse opacity-95 max-w-2xl m-0">
              {profile.description}
            </p>
          )}
        </div>
      </section>

      {/* STORY — soft theme surface, prose body. Becomes flex-grow when there's
          no contact section so the page fills the viewport on tall screens. */}
      {profile.story && (
        <section
          className={`py-24 px-6 md:px-12 bg-theme-subtle${hasContact ? "" : " flex-grow"}`}
        >
          <div className="max-w-3xl mx-auto">
            <MarkdownContent markdown={profile.story} />
          </div>
        </section>
      )}

      {/* CONTACT — dark theme bookend, matches homepage CTA. */}
      {hasContact && (
        <section className="cta-decor bg-theme-dark text-theme-on-dark flex-grow flex flex-col items-center justify-center py-24 px-6 md:px-12 gap-5">
          <span className="font-heading font-medium text-xs uppercase tracking-[0.24em] text-accent [font-variation-settings:'wdth'_85,'opsz'_12]">
            Get in touch
          </span>
          <h2 className="text-center font-heading font-bold text-[clamp(2rem,4vw,3rem)] leading-none tracking-[-0.03em] text-theme-on-dark m-0 [font-variation-settings:'wdth'_90,'opsz'_64]">
            Say{" "}
            <em className="font-sans italic font-medium text-accent [font-variation-settings:'opsz'_72]">
              hi.
            </em>
          </h2>
          <div className="flex flex-wrap justify-center gap-3.5 mt-2">
            {profile.email && (
              <a
                href={`mailto:${profile.email}`}
                className="inline-flex items-center gap-2 rounded-full py-3.5 px-7 bg-brand text-theme-inverse border-2 border-brand font-heading font-semibold text-[15px] hover:bg-brand-dark hover:-translate-y-0.5 transition-all [font-variation-settings:'wdth'_92,'opsz'_18]"
              >
                Get in Touch <span aria-hidden="true">→</span>
              </a>
            )}
            {profile.website && (
              <a
                href={profile.website}
                className="rounded-full py-3.5 px-7 border-2 border-theme-light text-theme-on-dark font-heading font-semibold text-[15px] hover:bg-brand-dark hover:border-theme hover:-translate-y-0.5 transition-all [font-variation-settings:'wdth'_92,'opsz'_18]"
              >
                Website
              </a>
            )}
          </div>
        </section>
      )}
    </>
  );
};
