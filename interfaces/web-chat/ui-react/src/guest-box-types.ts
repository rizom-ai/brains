/** Where the boxed Ask conversation stands, as the box presents it. */
export type GuestBoxState =
  | "connecting"
  | "ready"
  | "sending"
  | "working"
  | "complete"
  | "incomplete"
  | "uncertain"
  | "limit"
  | "unavailable"
  | "expired"
  | "ended";

/** The site's own words for the box's welcome. */
export interface GuestBoxCopy {
  title: string;
  notice: string;
  inputHint: string;
  topicsLabel: string;
  topics: string[];
}
