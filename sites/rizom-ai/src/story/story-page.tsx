/** @jsxImportSource react */
import type { JSX, ReactNode } from "react";
import type { Organism } from "./organism";

/**
 * The story pages' shape: the chapters on the left, one drawing beside them
 * that changes stage as the chapter under the reading line changes, and the
 * reading thread down the left edge. The runtime (see ./runtime) numbers the
 * chapters, sets the figure's stage and fills the thread.
 */

export interface StoryFigure {
  className: string;
  organism: Organism;
}

// The live rail's root, one slow S every half screen, and its two twigs.
const RAIL_ROOT =
  "M34,0 C22,120 44,200 32,330 C22,440 46,520 34,650 C26,760 44,840 34,1000";
const RAIL_TWIGS = [
  "M33,255 C16,272 12,300 4,312",
  "M35,720 C18,740 14,770 6,784",
];

export function ReadingThread(): JSX.Element {
  return (
    <nav className="rail" aria-label="On this page">
      <svg
        className="rail__svg"
        viewBox="0 0 70 1000"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path className="rail__root" d={RAIL_ROOT} />
        <path className="rail__fill" d={RAIL_ROOT} pathLength={1} />
        <g className="rail__twigs">
          {RAIL_TWIGS.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
        <circle className="rail__spark" r={2.6} />
      </svg>
      <ol className="rail__nodes" />
    </nav>
  );
}

export function StoryPage({
  figure,
  children,
}: {
  figure: StoryFigure;
  children: ReactNode;
}): JSX.Element {
  return (
    <>
      <link rel="stylesheet" href="/styles/story.css" precedence="page" />
      <ReadingThread />
      <div className="story">
        <div className="chapters">{children}</div>
        <figure
          className={`figure ${figure.className}`}
          data-stage="0"
          data-stages={figure.organism.stageCount}
          aria-hidden="true"
        >
          {figure.organism.svg()}
        </figure>
      </div>
    </>
  );
}
