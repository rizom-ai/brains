import type { JSX } from "react";
import {
  Head,
  LinkButton,
  MarkdownContent,
  tagVariants,
} from "@brains/ui-library";

/** One fact about the owner: a sentence, a set of tags, or a list of lines. */
export type AboutFact =
  | { heading: string; kind: "text"; value: string | null }
  | { heading: string; kind: "tags"; values: readonly string[] | null }
  | { heading: string; kind: "list"; values: readonly string[] | null };

export interface AboutContact {
  email: string | null;
  website: string | null;
  socialLinks: ReadonlyArray<{
    platform: string;
    url: string;
    label: string | null;
  }> | null;
}

export interface AboutPageProps {
  title: string;
  /** The page's meta description. */
  headDescription: string;
  description: string | null;
  story: string | null;
  facts: readonly AboutFact[];
  contact: AboutContact;
}

const hasContent = (fact: AboutFact): boolean =>
  fact.kind === "text" ? Boolean(fact.value) : (fact.values?.length ?? 0) > 0;

function Fact({ fact }: { fact: AboutFact }): JSX.Element {
  return (
    <section>
      <h2 className="text-sm tracking-widest uppercase text-theme-muted mb-6">
        {fact.heading}
      </h2>
      {fact.kind === "text" && (
        <p className="text-lg text-theme leading-relaxed">{fact.value}</p>
      )}
      {fact.kind === "tags" && (
        <ul className="flex flex-wrap gap-3">
          {fact.values?.map((value, i) => (
            <li
              key={i}
              className={tagVariants({
                variant: "accent",
                size: "lg",
              })}
            >
              {value}
            </li>
          ))}
        </ul>
      )}
      {fact.kind === "list" && (
        <ul className="space-y-3 text-lg text-theme leading-relaxed">
          {fact.values?.map((value, i) => (
            <li key={i}>{value}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Contact({ contact }: { contact: AboutContact }): JSX.Element {
  return (
    <section>
      <h2 className="text-sm tracking-widest uppercase text-theme-muted mb-6">
        Contact
      </h2>
      <div className="space-y-4">
        {contact.email && (
          <p className="text-lg">
            <a
              href={`mailto:${contact.email}`}
              className="text-brand hover:text-brand-dark transition-colors"
            >
              {contact.email}
            </a>
          </p>
        )}
        {contact.website && (
          <p className="text-lg">
            <a
              href={contact.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand hover:text-brand-dark transition-colors"
            >
              {contact.website}
            </a>
          </p>
        )}
        {contact.socialLinks && contact.socialLinks.length > 0 && (
          <div className="flex flex-wrap gap-4 mt-4">
            {contact.socialLinks.map((link, i) => (
              <LinkButton
                key={i}
                href={link.url}
                external
                variant="secondary"
                size="md"
              >
                {link.label?.length ? link.label : link.platform}
              </LinkButton>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * The about page: a hero with the name and description, the story as
 * full-width prose, then a grid of facts and the ways to get in touch. Facts
 * with nothing in them are left out, so no heading stands empty.
 */
export function AboutPage({
  title,
  headDescription,
  description,
  story,
  facts,
  contact,
}: AboutPageProps): JSX.Element {
  const shown = facts.filter(hasContent);
  const reachable =
    Boolean(contact.email) ||
    Boolean(contact.website) ||
    (contact.socialLinks?.length ?? 0) > 0;

  return (
    <>
      <Head title={title} description={headDescription} ogType="profile" />
      <div className="about-page bg-theme">
        {/* Hero Section */}
        <header className="hero-bg-pattern relative w-full py-16 md:py-24 px-6 md:px-12 bg-theme overflow-hidden">
          <div className="relative z-10 max-w-4xl mx-auto">
            <h1 className="text-5xl md:text-6xl font-semibold mb-6 text-heading">
              {title}
            </h1>
            {description && (
              <p className="text-xl md:text-2xl text-theme-muted leading-relaxed">
                {description}
              </p>
            )}
          </div>
        </header>

        {/* Main Content */}
        <div className="container mx-auto px-6 md:px-12 max-w-4xl py-12 md:py-16">
          {/* Zone 1: Story — Full-width prose, no section heading */}
          {story && (
            <section className="content-section-reveal mb-20 md:mb-28">
              <MarkdownContent markdown={story} />
            </section>
          )}

          {/* Zone 2: Structured grid */}
          {(shown.length > 0 || reachable) && (
            <div className="content-section-reveal grid md:grid-cols-2 gap-x-16 gap-y-12">
              {shown.map((fact) => (
                <Fact key={fact.heading} fact={fact} />
              ))}
              {reachable && <Contact contact={contact} />}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
