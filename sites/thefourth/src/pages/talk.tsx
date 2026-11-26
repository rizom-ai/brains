import type { JSX } from "react";
import {
  defineSection,
  z,
  type JsonObject,
  type RouteDefinitionInput,
  type SectionDefinition,
} from "@rizom/site";
import { linkSchema } from "../home/links";
import { Button, Dot, Label, lightSchema, PageWrap, pageRoute } from "./common";

/**
 * Let's talk: a path for each kind of visitor, what happens after they
 * write, the brand test for those not ready to talk, and every way to say
 * hello.
 */
const pathSchema = z.object({
  light: lightSchema,
  title: z.string(),
  text: z.string(),
  action: linkSchema,
  tone: z.enum(["ink", "red"]).default("ink"),
});

const pathsSchema = z.object({
  label: z.string(),
  paths: z.array(pathSchema),
});

function PathsSection({
  label,
  paths,
}: z.infer<typeof pathsSchema>): JSX.Element {
  return (
    <section className="tf-paths">
      <PageWrap className="tf-stack tf-stack--loose">
        <Label>{label}</Label>
        <div className="tf-paths__grid">
          {paths.map((path) => (
            <div key={path.title} className="tf-pcard tf-path">
              <span className={`tf-bar-mark tf-bar-mark--${path.light}`} />
              <h2 className="tf-path__title">{path.title}</h2>
              <p className="tf-body">{path.text}</p>
              <div className="tf-path__action">
                <Button link={path.action} tone={path.tone} />
              </div>
            </div>
          ))}
        </div>
      </PageWrap>
    </section>
  );
}

export const paths: SectionDefinition = defineSection(
  pathsSchema,
  PathsSection,
  {
    title: "Let's talk — paths",
    description:
      "The paths a visitor can take: the label over them and each path's light, title, line, button (label and link) and button tone (ink or red).",
  },
);

const stepsSchema = z.object({
  label: z.string(),
  steps: z.array(z.string()),
});

function StepsSection({
  label,
  steps,
}: z.infer<typeof stepsSchema>): JSX.Element {
  return (
    <section className="tf-band">
      <PageWrap className="tf-band__inner tf-stack">
        <Label>{label}</Label>
        <ol className="tf-steps">
          {steps.map((step, index) => (
            <li key={step}>
              <span className="tf-steps__number">{index + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </PageWrap>
    </section>
  );
}

export const steps: SectionDefinition = defineSection(
  stepsSchema,
  StepsSection,
  {
    title: "Let's talk — what happens next",
    description:
      "What happens after a visitor writes: the label and the steps.",
  },
);

const testSchema = z.object({
  eyebrow: z.string(),
  headline: z.string(),
  text: z.string(),
  action: linkSchema,
});

function TestSection({
  eyebrow,
  headline,
  text,
  action,
}: z.infer<typeof testSchema>): JSX.Element {
  return (
    <section className="tf-test">
      <PageWrap className="tf-test__inner">
        <div className="tf-stack">
          <p className="tf-intro__eyebrow">
            <Dot light="ink" />
            <span>{eyebrow}</span>
          </p>
          <p className="tf-test__headline">{headline}</p>
        </div>
        <div className="tf-stack tf-stack--start">
          <p className="tf-body tf-body--large">{text}</p>
          <Button link={action} tone="ink" />
        </div>
      </PageWrap>
    </section>
  );
}

export const brandTest: SectionDefinition = defineSection(
  testSchema,
  TestSection,
  {
    title: "Let's talk — the brand test",
    description:
      "For visitors not ready to talk: the italic line, the headline, the sentence and the link to the test.",
  },
);

const contactSchema = z.object({
  label: z.string(),
  headline: z.string(),
  rows: z.array(
    z.object({
      label: z.string(),
      text: z.string(),
      href: z.string().default(""),
    }),
  ),
});

function ContactSection({
  label,
  headline,
  rows,
}: z.infer<typeof contactSchema>): JSX.Element {
  return (
    <section className="tf-band">
      <PageWrap className="tf-band__inner tf-split">
        <div className="tf-stack">
          <Label>{label}</Label>
          <h2 className="tf-h2 tf-h2--small tf-reveal">{headline}</h2>
        </div>
        <dl className="tf-contact">
          {rows.map((row) => (
            <div key={row.label} className="tf-contact__row">
              <dt className="tf-plabel tf-plabel--muted">{row.label}</dt>
              <dd>
                {row.href ? (
                  <a
                    className="tf-link"
                    href={row.href}
                    {...(row.href.startsWith("http")
                      ? { target: "_blank", rel: "noopener" }
                      : {})}
                  >
                    {row.text}
                  </a>
                ) : (
                  row.text
                )}
              </dd>
            </div>
          ))}
        </dl>
      </PageWrap>
    </section>
  );
}

export const contact: SectionDefinition = defineSection(
  contactSchema,
  ContactSection,
  {
    title: "Let's talk — say hello",
    description:
      "Every way to reach The Fourth: the label, the headline and the rows (label, words and an optional link; links elsewhere open in a new tab).",
  },
);

const MAIL = "mailto:nihao.fourth@gmail.com";

const talkContent = {
  intro: {
    light: "mustard",
    eyebrow: "Let’s talk",
    headline: "You made something that matters. Let’s get it heard.",
    lede: "The first step is small. Tell us what you’re working on and who needs to understand it. We’ll tell you honestly whether we can help.",
  },
  paths: {
    label: "Pick your path",
    paths: [
      {
        light: "red",
        title: "Brands and organisations",
        text: "Start with a conversation or a Communication Diagnosis.",
        action: {
          label: "Book a conversation →",
          href: `${MAIL}?subject=Booking%20a%20conversation`,
        },
      },
      {
        light: "mint",
        title: "Creators",
        text: "Tell us about your work and your audience.",
        action: {
          label: "Write to us →",
          href: `${MAIL}?subject=Creator`,
        },
      },
      {
        light: "mustard",
        title: "Agencies and consultants",
        text: "Need a creator partner or a diagnosis for a client?",
        action: {
          label: "Partner with us →",
          href: `${MAIL}?subject=Partnership`,
        },
      },
      {
        light: "ink",
        title: "Talks and workshops",
        text: "Creator economy, brand narrative, emotion in content.",
        action: {
          label: "Invite us →",
          href: `${MAIL}?subject=Talk%20or%20workshop`,
        },
        tone: "red",
      },
    ],
  },
  steps: {
    label: "What happens next",
    steps: [
      "We reply to your message.",
      "A call to understand your world and your goal.",
      "A scope and quote, priced by hours and type of service.",
    ],
  },
  "brand-test": {
    eyebrow: "Not ready to talk?",
    headline: "Take the test.",
    text: "Find out in three minutes what kind of brand you are.",
    action: { label: "Take the test →", href: "/brand-test" },
  },
  contact: {
    label: "Contact",
    headline: "Say hello.",
    rows: [
      { label: "Email", text: "nihao.fourth@gmail.com", href: MAIL },
      {
        label: "Instagram",
        text: "@notaboutyou_bs ↗",
        href: "https://www.instagram.com/notaboutyou_bs/",
      },
      {
        label: "LinkedIn",
        text: "The Fourth ↗",
        href: "https://www.linkedin.com/company/hello-the-fourth",
      },
      {
        label: "Podcast",
        text: "Not About You 不是在說你 ↗",
        href: "https://podcasts.apple.com/tw/podcast/%E4%B8%8D%E6%98%AF%E5%9C%A8%E8%AA%AA%E4%BD%A0/id1674146827?l=en-GB",
      },
      { label: "Studio", text: "Taipei, Taiwan" },
    ],
  },
} satisfies Record<string, JsonObject>;

export const talkRoute: RouteDefinitionInput = pageRoute(
  {
    id: "work-with-us",
    path: "/work-with-us",
    title: "Let’s talk — The Fourth",
    description:
      "Tell The Fourth what you are working on and who needs to understand it.",
  },
  [
    { id: "intro", template: "page:intro", content: talkContent.intro },
    { id: "paths", template: "talk:paths", content: talkContent.paths },
    { id: "steps", template: "talk:steps", content: talkContent.steps },
    {
      id: "brand-test",
      template: "talk:brand-test",
      content: talkContent["brand-test"],
    },
    { id: "contact", template: "talk:contact", content: talkContent.contact },
  ],
);
