/** @jsxImportSource react */
import type { ReactElement } from "react";
import { GuestMarkdown } from "./GuestTranscript";
import type { GuestBoxCopy } from "./guest-box-types";

/**
 * The box's heading, and the site's welcome while nothing has been asked:
 * its title heads the conversation; otherwise the heading is for screen
 * readers only.
 */
export function GuestBoxWelcome(props: {
  copy: GuestBoxCopy;
  welcome: boolean;
  /** The visitor picked one of the site's topics. */
  onTopic: (topic: string) => void;
}): ReactElement {
  const { copy, welcome } = props;
  return (
    <>
      {welcome && (copy.title || copy.notice || copy.topics.length > 0) && (
        <div className="brain-box-welcome">
          {copy.title && (
            <h2 id="brain-chat-heading" className="display">
              {copy.title}
            </h2>
          )}
          {copy.notice && (
            <div className="chat-notice">
              <GuestMarkdown>{copy.notice}</GuestMarkdown>
            </div>
          )}
          <div className="hints" aria-label={copy.topicsLabel}>
            {copy.topics.map((topic, index) => (
              <button
                type="button"
                key={`${index}:${topic}`}
                onClick={(): void => props.onTopic(topic)}
              >
                {topic}
              </button>
            ))}
          </div>
        </div>
      )}
      {(!welcome || !copy.title) && (
        <h2 id="brain-chat-heading" className="brain-box-sr-only">
          {copy.title || "Ask"}
        </h2>
      )}
    </>
  );
}
