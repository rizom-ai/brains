import type { JSX } from "react";
import type { GuideWithData } from "../schemas/guide";
import { guideHref, guideRecipeLabel } from "../lib/guide-order";
import { romanNumeral } from "../lib/guide-page-content";

/** One guide as a card: its number, persona, who it is for and its recipe. */
export const GuideCard = ({
  guide,
  position,
  reveal = false,
}: {
  guide: GuideWithData;
  /** The guide's place among all guides, counting from 1. */
  position: number;
  /** Reveal the card as it is reached (the guide page script). */
  reveal?: boolean;
}): JSX.Element => (
  <a
    className={`guide-card${reveal ? " guide-reveal" : ""}`}
    href={guideHref(guide)}
  >
    <p className="guide-label">Guide {romanNumeral(position)}</p>
    <h3>{guide.metadata.persona}</h3>
    <p className="guide-card__for">{guide.metadata.for}</p>
    <span className="guide-card__recipe">
      {guideRecipeLabel(guide.metadata.recipe)}
    </span>
  </a>
);

/** Every guide as a card, by order and numbered by place. */
export const GuideCards = ({
  guides,
}: {
  guides: GuideWithData[];
}): JSX.Element => (
  <div className="guide-cards">
    {guides.map((guide, index) => (
      <GuideCard guide={guide} key={guide.id} position={index + 1} />
    ))}
  </div>
);
