/** @jsxImportSource react */
import type { JSX } from "react";
import {
  ASK_BOX_ATTRIBUTE,
  ASK_SEND_ATTRIBUTE,
  ASK_STATUS_ATTRIBUTE,
  ASK_STYLED_ATTRIBUTE,
} from "@brains/contracts";

/**
 * The guest chat box's host on a page that presents it (see @brains/contracts
 * ask-box): disabled until Web Chat's box boot enables it; the boot mounts the
 * conversation here and never sends on its own. Web Chat styles the mounted
 * box; the page themes and frames it through the class prefix.
 */
export function AskBoxHost({ prefix }: { prefix: string }): JSX.Element {
  return (
    <div
      className={`${prefix}__ask`}
      {...{ [ASK_BOX_ATTRIBUTE]: "", [ASK_STYLED_ATTRIBUTE]: "" }}
    >
      <p
        className={`${prefix}__ask-status`}
        role="status"
        {...{ [ASK_STATUS_ATTRIBUTE]: "" }}
      />
      <div className={`${prefix}__composer`}>
        <textarea rows={1} disabled aria-label="Your question" />
        <button
          type="button"
          className={`${prefix}__send`}
          disabled
          aria-label="Send question"
          {...{ [ASK_SEND_ATTRIBUTE]: "" }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}
