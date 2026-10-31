import type { JSX } from "react";
import { DocsPageShell } from "@brains/docs-chrome";
import type { GuideWithData } from "../schemas/guide";
import { sortGuides } from "../lib/guide-order";
import { GuideCards } from "./guide-card";
import guideBaseCss from "./guide-base.css" with { type: "text" };

export interface GuideListProps {
  guides: GuideWithData[];
}

/** What the guides are, shared by the index and the docs-home band. */
export const guidesIntro = {
  label: "Moving in",
  lead: "Bring what you already ",
  accent: "have.",
  sentence:
    "One guide for each kind of user, and one for running your own brain.",
};

export const GuideListTemplate = ({ guides }: GuideListProps): JSX.Element => (
  <DocsPageShell
    title="Guides"
    description={guidesIntro.sentence}
    current="guides"
    footer
    bleed
  >
    <style>{guideBaseCss}</style>
    <div className="guide-page guide-index">
      <div className="guide-wrap">
        <header className="guide-index__head">
          <p className="guide-label">{guidesIntro.label}</p>
          <h1 className="guide-display">
            {guidesIntro.lead}
            <em className="guide-accent">{guidesIntro.accent}</em>
          </h1>
          <p>{guidesIntro.sentence}</p>
        </header>
        <GuideCards guides={sortGuides(guides)} />
      </div>
    </div>
  </DocsPageShell>
);
