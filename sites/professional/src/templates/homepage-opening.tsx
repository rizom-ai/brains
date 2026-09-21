import type { JSX } from "react";
import type { HomepageOpeningContent } from "../schemas/homepage-opening";
import { MarkdownContent, renderHighlightedText } from "@brains/ui-library";
import { homepageOpeningStyles } from "./homepage-opening-styles";

/** The opening is authored content, not a simulated turn or a chat mount. */
export function HomepageOpening({
  content,
  owner,
}: {
  content: HomepageOpeningContent;
  owner: string;
}): JSX.Element {
  return (
    <header className="homepage-opening hero-bg-pattern">
      <style>{homepageOpeningStyles}</style>
      <div className="homepage-opening__inner">
        <span className="homepage-opening__eyebrow">A place to begin</span>
        {content.title && (
          <h1>
            {renderHighlightedText(content.title, "homepage-opening__emphasis")}
          </h1>
        )}
        {content.introduction && (
          <MarkdownContent
            markdown={content.introduction}
            className="homepage-opening__prose"
          />
        )}
        {owner && (
          <p className="homepage-opening__signature">
            — {owner}
            <span>An authored note</span>
          </p>
        )}
        <div className="homepage-opening__next">
          {Boolean(content.topics.length) && (
            <nav
              aria-label="Conversation topics"
              className="homepage-opening__topics"
            >
              {content.topics.map((topic, index) => (
                <a key={`${index}-${topic}`} href={content.contactUrl}>
                  {topic}
                  <span aria-hidden="true">↗</span>
                </a>
              ))}
            </nav>
          )}
          <a className="homepage-opening__contact" href={content.contactUrl}>
            Let’s talk<span aria-hidden="true">→</span>
          </a>
          <p className="homepage-opening__note">
            A private note to the owner. No account needed.
          </p>
        </div>
      </div>
    </header>
  );
}
