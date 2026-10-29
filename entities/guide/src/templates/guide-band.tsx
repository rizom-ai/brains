import type { JSX } from "react";
import { DocsPageSection } from "@brains/docs-chrome";
import { sortGuides } from "../lib/guide-order";
import { GuideCards } from "./guide-card";
import { guidesIntro, type GuideListProps } from "./guide-list";
import guideBaseCss from "./guide-base.css" with { type: "text" };

/**
 * The guides as a band on a docs page the site composes from sections, such
 * as the docs home between its hero and its sections. Without guides there is
 * no band.
 */
export const GuideBandTemplate = ({ guides }: GuideListProps): JSX.Element =>
  guides.length === 0 ? (
    <></>
  ) : (
    <DocsPageSection>
      <style>{guideBaseCss}</style>
      <section className="guide-page guide-home">
        <div className="guide-home__head">
          <p className="guide-label">{guidesIntro.label}</p>
          <h2 className="guide-display">
            {guidesIntro.lead}
            <em className="guide-accent">{guidesIntro.accent}</em>
          </h2>
          <p>{guidesIntro.sentence}</p>
        </div>
        <GuideCards guides={sortGuides(guides)} />
      </section>
    </DocsPageSection>
  );
