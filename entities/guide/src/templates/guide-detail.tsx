import type { CSSProperties, JSX } from "react";
import { DocsPageShell } from "@brains/docs-chrome";
import { markdownToHtml } from "@brains/ui-library";
import type { GuideWithData } from "../schemas/guide";
import type { GuideMaterial, GuideRecipe } from "../schemas/guide-frontmatter";
import { parseGuideStages, type GuideStage } from "../lib/guide-stages";
import {
  closingHeading,
  entityTypeNote,
  guideRecipeHighlights,
  materialFragments,
  romanNumeral,
  splitTitle,
  stagesHeading,
} from "../lib/guide-page-content";
import { GuideCard } from "./guide-card";
import guideBaseCss from "./guide-base.css" with { type: "text" };
import guidePageCss from "./guide-page.css" with { type: "text" };

export interface GuideDetailProps {
  guide: GuideWithData;
  otherGuides: GuideWithData[];
}

const SELF_HOSTING_SLUG = "self-hosting";
const SELF_HOSTING_TITLE = "Running your own brain";

/** Custom properties the stylesheet reads, set per element. */
const vars = (values: Record<string, string | number>): CSSProperties => values;

/** Where a guide sits among all of them, counting from 1 by order. */
function guidePosition(
  guide: GuideWithData,
  all: GuideWithData[],
): { position: number; total: number } {
  return {
    position:
      all.filter((other) => other.metadata.order < guide.metadata.order)
        .length + 1,
    total: all.length,
  };
}

const Html = ({
  markdown,
  className,
}: {
  markdown: string;
  className?: string;
}): JSX.Element => (
  <div
    {...(className && { className })}
    dangerouslySetInnerHTML={{ __html: markdownToHtml(markdown) }}
  />
);

/** Inline markdown, without the paragraph markdownToHtml wraps it in. */
function inlineHtml(markdown: string): string {
  return markdownToHtml(markdown)
    .trim()
    .replace(/^<p>([\s\S]*)<\/p>$/, "$1");
}

const Opening = ({
  guide,
  place,
}: {
  guide: GuideWithData;
  place: { position: number; total: number };
}): JSX.Element => {
  const { title, persona } = guide.metadata;
  const { lead, accent } = splitTitle(title);
  return (
    <section className="guide-opening" data-guide-opening>
      <div className="guide-opening__stage">
        <div className="guide-fragments" aria-hidden="true">
          {materialFragments(guide.metadata.material).map((fragment) => (
            <div
              className="guide-fragment"
              key={`${fragment.label}-${fragment.text}`}
              style={vars({
                "--x": fragment.x,
                "--y": fragment.y,
                "--ny": fragment.narrowY,
                "--r": fragment.rotate,
              })}
            >
              <b>{fragment.label}</b>
              {fragment.text}
            </div>
          ))}
        </div>
        <div className="guide-seed" aria-hidden="true" />
        <div className="guide-opening__copy">
          <p className="guide-label">
            Moving in · Guide {romanNumeral(place.position)} of{" "}
            {romanNumeral(place.total)} · {persona}
          </p>
          <h1 className="guide-display">
            {lead}
            <em className="guide-accent">{accent}</em>
          </h1>
          <p className="guide-opening__for">{guide.metadata.for}</p>
        </div>
        <p className="guide-settled" aria-hidden="true">
          By the end of this guide it lives in one brain that is yours.
        </p>
        <div className="guide-cue" aria-hidden="true">
          Scroll
        </div>
      </div>
    </section>
  );
};

const Where = ({ where }: { where: string }): JSX.Element => {
  const places = where
    .split(",")
    .map((place) => place.trim())
    .filter((place) => place.length > 0);
  if (places.length < 2) {
    return <p className="guide-source__where">{where}</p>;
  }
  return (
    <p className="guide-source__where">
      {places.map((place, index) => (
        <span key={place}>
          {index > 0 && " · "}
          <span className="guide-platform">{place}</span>
        </span>
      ))}
    </p>
  );
};

const MaterialMap = ({
  material,
}: {
  material: GuideMaterial[];
}): JSX.Element => {
  // One pill per type, in the row of the first source that becomes it.
  const types = material
    .map((item, index) => ({ type: item.becomes, row: index + 1 }))
    .filter(
      (item, index, all) =>
        all.findIndex((other) => other.type === item.type) === index,
    );
  return (
    <section className="guide-band">
      <div className="guide-wrap">
        <div className="guide-band__head guide-reveal">
          <p className="guide-label">What you're bringing</p>
          <h2 className="guide-display">
            Everything you have already has a place.
          </h2>
          <p>
            Nothing needs to be rewritten before it comes in. Each kind of
            material lands as its own kind of content, and the brain can read
            across all of it.
          </p>
        </div>
        <div className="guide-map" data-guide-map>
          <svg
            className="guide-map__lines"
            aria-hidden="true"
            data-guide-lines
          />
          {material.map((item, index) => (
            <article
              className="guide-source guide-reveal"
              data-guide-source={item.becomes}
              key={`${item.from}-${item.becomes}`}
              style={vars({ "--row": index + 1 })}
            >
              <h3>{item.from}</h3>
              <Where where={item.where} />
              <p className="guide-source__becomes">→ {item.becomes}</p>
              <p className="guide-source__how">{item.how}</p>
            </article>
          ))}
          {types.map(({ type, row }) => (
            <div
              className="guide-type"
              data-guide-type={type}
              key={type}
              style={vars({ "--row": row })}
            >
              <i className="guide-bulb" aria-hidden="true" />
              {type}
              {entityTypeNote(type) && <small>{entityTypeNote(type)}</small>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const doors = [
  { name: "Chat", what: "talk to it, upload files" },
  { name: "Studio", what: "browse and edit everything" },
  { name: "AI tools", what: "use it from Claude or ChatGPT" },
];

const Start = ({
  recipe,
  selfHostingTitle,
}: {
  recipe: GuideRecipe;
  selfHostingTitle: string;
}): JSX.Element => (
  <section className="guide-band" data-guide-start>
    <div className="guide-wrap guide-start">
      <div className="guide-start__copy guide-reveal">
        <p className="guide-label">Start from</p>
        <h2 className="guide-display">
          The <em className="guide-accent">{recipe}</em> recipe
        </h2>
        <p>
          It brings what this guide uses. Whoever runs your brain sets it up
          from this recipe; after that, everything here happens in chat, Studio
          or your AI tools.
        </p>
        <ul>
          {guideRecipeHighlights(recipe).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <a className="guide-aside" href={`/guides/${SELF_HOSTING_SLUG}`}>
          Running the brain yourself? Start with <b>{selfHostingTitle}</b>, then
          come back here.
        </a>
      </div>
      <div className="guide-invite guide-reveal">
        <p className="guide-invite__meta">
          <span>Welcome email</span>
          <span>From your brain</span>
        </p>
        <h3>Your brain is ready</h3>
        <p className="guide-invite__intro">
          It is set up and waiting for you. Set up a passkey to sign in, then
          pick where you want to work.
        </p>
        <div className="guide-invite__doors">
          {doors.map((door) => (
            <span className="guide-door" key={door.name}>
              <b>{door.name}</b>
              {door.what}
            </span>
          ))}
        </div>
      </div>
    </div>
  </section>
);

const stageNumber = (stage: GuideStage): string =>
  String(stage.number).padStart(2, "0");

const Stage = ({ stage }: { stage: GuideStage }): JSX.Element => (
  <article
    className={`guide-stage${stage.points.length > 0 ? " guide-stage--points" : ""}`}
    id={stage.id}
  >
    <div className="guide-stage__text guide-reveal">
      <div className="guide-stage__num" aria-hidden="true">
        {stageNumber(stage)}
      </div>
      <h3>{stage.heading}</h3>
      <Html className="guide-prose" markdown={stage.prose} />
      {stage.steps.length > 0 && (
        <div className="guide-steps">
          {stage.steps.map((step) => (
            <a className="guide-chip" href={step.href} key={step.href}>
              <span className="guide-chip__kicker">Exact steps</span>
              {step.label}
            </a>
          ))}
        </div>
      )}
    </div>
    {stage.points.length > 0 && (
      <ul className="guide-points">
        {stage.points.map((point) => (
          <li key={point}>
            <span dangerouslySetInnerHTML={{ __html: inlineHtml(point) }} />
          </li>
        ))}
      </ul>
    )}
  </article>
);

const Stages = ({ stages }: { stages: GuideStage[] }): JSX.Element => (
  <section className="guide-band">
    <div className="guide-wrap">
      <div className="guide-band__head guide-reveal">
        <p className="guide-label">Moving in</p>
        <h2 className="guide-display">{stagesHeading(stages.length)}</h2>
      </div>
      <div className="guide-stages">
        <nav className="guide-rail" aria-label="Stages" data-guide-rail>
          <ol>
            <i className="guide-rail__fill" data-guide-rail-fill />
            {stages.map((stage) => (
              <li data-guide-for={stage.id} key={stage.id}>
                <a href={`#${stage.id}`}>
                  <span className="guide-rail__num">{stageNumber(stage)}</span>
                  {stage.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <div>
          {stages.map((stage) => (
            <Stage key={stage.id} stage={stage} />
          ))}
        </div>
      </div>
    </div>
  </section>
);

const Closing = ({
  guide,
  otherGuides,
  all,
}: {
  guide: GuideWithData;
  otherGuides: GuideWithData[];
  all: GuideWithData[];
}): JSX.Element => (
  <section className="guide-band">
    <div className="guide-wrap">
      <div className="guide-band__head guide-reveal">
        <p className="guide-label">Other ways in</p>
        <h2 className="guide-display">
          {closingHeading(guide.metadata.persona)}
        </h2>
      </div>
      <div className="guide-cards">
        {otherGuides.map((other) => (
          <GuideCard
            guide={other}
            key={other.id}
            position={guidePosition(other, all).position}
            reveal
          />
        ))}
      </div>
    </div>
  </section>
);

export const GuideDetailTemplate = ({
  guide,
  otherGuides,
}: GuideDetailProps): JSX.Element => {
  const all = [guide, ...otherGuides];
  const stages = parseGuideStages(guide.body);
  const selfHosting = otherGuides.find(
    (other) => other.metadata.slug === SELF_HOSTING_SLUG,
  );
  return (
    <DocsPageShell
      title={guide.metadata.title}
      description={guide.metadata.for}
      current="guides"
      detail
      footer
      bleed
    >
      <style>{guideBaseCss}</style>
      <style>{guidePageCss}</style>
      <div className="guide-page" data-guide-page>
        <Opening guide={guide} place={guidePosition(guide, all)} />
        {guide.metadata.material.length > 0 && (
          <MaterialMap material={guide.metadata.material} />
        )}
        {guide.metadata.recipe && (
          <Start
            recipe={guide.metadata.recipe}
            selfHostingTitle={selfHosting?.metadata.title ?? SELF_HOSTING_TITLE}
          />
        )}
        {stages.length > 0 && <Stages stages={stages} />}
        {otherGuides.length > 0 && (
          <Closing guide={guide} otherGuides={otherGuides} all={all} />
        )}
      </div>
    </DocsPageShell>
  );
};
