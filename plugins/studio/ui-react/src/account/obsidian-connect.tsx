/** @jsxImportSource react */
import { Button } from "@brains/app-ui-react";
import type {
  AuthAccountAppPassword,
  AuthAccountAppPasswordSecret,
} from "@brains/contracts";
import type { ReactElement } from "react";
import { accountClass } from "../studio-account.styles";
import { aiToolsStyles as s } from "../studio-ai-tools.styles";

/** A Connect request Obsidian opened this page with. */
export interface ObsidianConnect {
  /** Obsidian's own value, handed back so it knows the answer is to its request. */
  state: string;
}

/** The `obsidian://` action the Brain Sync plugin answers. */
const PROTOCOL = "obsidian://brain-sync";
const STATE = /^[A-Za-z0-9_-]{8,128}$/;

/** The Connect request in this page's query, if Obsidian opened it. */
export function parseObsidianConnect(
  rawSearch: string,
): ObsidianConnect | undefined {
  const params = new URLSearchParams(rawSearch);
  const state = params.get("state");
  if (params.get("connect") !== "obsidian" || state === null) return undefined;
  return STATE.test(state) ? { state } : undefined;
}

/** The name Connect gives the app password it creates. */
export const CONNECT_LABEL = "Obsidian";

/**
 * The app password Connect created, once it exists: named Obsidian, allowed
 * to save, and not the one shown when the person chose Connect. A password
 * made by hand before stays on this page and never goes to Obsidian.
 */
export function connectPassword(
  created: AuthAccountAppPasswordSecret | null,
  /** The username of the password shown when Connect was chosen. */
  shownBefore: string | null,
  /** The account's app passwords, which say each one's name and access. */
  listed: readonly AuthAccountAppPassword[],
): AuthAccountAppPasswordSecret | null {
  if (created === null || created.username === shownBefore) return null;
  const entry = listed.find(
    (candidate) => candidate.username === created.username,
  );
  return entry?.label === CONNECT_LABEL && entry.access === "write"
    ? created
    : null;
}

/** The link that hands a new app password to the Obsidian that asked. */
export function obsidianConnectLink(
  state: string,
  created: Pick<AuthAccountAppPasswordSecret, "username" | "password">,
): string {
  const params = new URLSearchParams({
    state,
    username: created.username,
    password: created.password,
  });
  return `${PROTOCOL}?${params.toString()}`;
}

/**
 * Obsidian asked to sync with this brain. Nothing is created until the
 * person confirms; then the new app password goes straight to Obsidian and
 * is never shown here.
 */
export function ObsidianConnectCard(props: {
  connect: ObsidianConnect;
  created: AuthAccountAppPasswordSecret | null;
  busy: boolean;
  onConnect: () => void;
}): ReactElement {
  const { connect, created } = props;
  return (
    <article
      data-obsidian-connect
      className={accountClass("drive-reveal", s.client)}
    >
      <h4 className={accountClass("", s.clientName)}>Connect Obsidian</h4>
      {created ? (
        <>
          <p className={accountClass("", s.text)}>
            Obsidian has its own app password now. If Obsidian did not open,
            open it here; you can then close this page.
          </p>
          <a href={obsidianConnectLink(connect.state, created)}>
            Open Obsidian
          </a>
        </>
      ) : (
        <>
          <p className={accountClass("", s.text)}>
            Obsidian on this device asked to sync with your brain. Connecting
            creates an app password named Obsidian that may save changes, and
            hands it to Obsidian. You can revoke it here at any time.
          </p>
          <Button type="button" disabled={props.busy} onClick={props.onConnect}>
            Connect Obsidian
          </Button>
        </>
      )}
    </article>
  );
}
