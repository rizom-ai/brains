import { Fragment, type JSX } from "preact";

const EMPHASIS_PATTERN = /(\*[^*]+\*)/;

/**
 * Render a content string with two lightweight markup conventions:
 *
 * - `\n` in the string produces a `<br />` (for multi-line headlines)
 * - Any `*...*` run is wrapped in a `<span>` carrying `highlightClass`
 *
 * Authors write the phrase as one natural string in markdown content;
 * the renderer does the structural split. Highlight styling is passed
 * per-brand (rizom.ai uses accent+midline, professional uses italic+accent)
 * so each consumer owns its own emphasis treatment while the parsing/
 * structure is shared.
 */
export function renderHighlightedText(
  text: string,
  highlightClass: string,
): JSX.Element {
  const lines = text.split("\n");
  return (
    <Fragment>
      {lines.map((line, lineIdx) => (
        <Fragment key={lineIdx}>
          {lineIdx > 0 && <br />}
          {line.split(EMPHASIS_PATTERN).map((part, partIdx) => {
            if (
              part.length >= 3 &&
              part.startsWith("*") &&
              part.endsWith("*")
            ) {
              return (
                <span key={partIdx} className={highlightClass}>
                  {part.slice(1, -1)}
                </span>
              );
            }
            return <Fragment key={partIdx}>{part}</Fragment>;
          })}
        </Fragment>
      ))}
    </Fragment>
  );
}
