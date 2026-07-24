/** @jsxImportSource react */

import {
  AUTH_ACCOUNT_MUTATION_ACTIONS,
  type AuthAccountMutation,
  type AuthAccountRole,
  type AuthAccountSnapshot,
} from "@brains/auth-service/account-contracts";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  fetchAccount,
  mutateAccount,
  registerPasskey,
  type AccountMutationResponse,
} from "./api";
import styles from "./account.css" with { type: "text" };

export interface AccountBootstrap {
  displayName: string;
  role: AuthAccountRole;
  routePath: string;
}

export interface AccountClient {
  fetchAccount: () => Promise<AuthAccountSnapshot>;
  mutateAccount: (
    mutation: AuthAccountMutation,
  ) => Promise<AccountMutationResponse>;
  registerPasskey: () => Promise<AuthAccountSnapshot>;
}

export interface AccountAppProps {
  bootstrap: AccountBootstrap;
  initialAccount?: AuthAccountSnapshot;
  client?: AccountClient;
}

const defaultClient: AccountClient = {
  fetchAccount,
  mutateAccount,
  registerPasskey,
};

function formatDate(value: number, milliseconds = false): string {
  const date = new Date(milliseconds ? value : value * 1000);
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Account request failed";
}

export function AccountApp({
  bootstrap,
  initialAccount,
  client = defaultClient,
}: AccountAppProps): React.ReactElement {
  const [account, setAccount] = useState(initialAccount);
  const [displayName, setDisplayName] = useState(
    initialAccount?.displayName ?? bootstrap.displayName,
  );
  const [status, setStatus] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initialAccount) return;
    let cancelled = false;
    client
      .fetchAccount()
      .then((next) => {
        if (cancelled) return;
        setAccount(next);
        setDisplayName(next.displayName);
      })
      .catch((nextError: unknown) => {
        if (cancelled) return;
        setError(true);
        setStatus(messageOf(nextError));
      });
    return (): void => {
      cancelled = true;
    };
  }, [client, initialAccount]);

  const run = useCallback(
    async (
      pending: string,
      complete: string,
      action: () => Promise<AuthAccountSnapshot | undefined>,
    ): Promise<void> => {
      setBusy(true);
      setError(false);
      setStatus(pending);
      try {
        const next = await action();
        if (next) {
          setAccount(next);
          setDisplayName(next.displayName);
        }
        setStatus(complete);
      } catch (nextError) {
        setError(true);
        setStatus(messageOf(nextError));
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const mutate = useCallback(
    async (
      mutation: AuthAccountMutation,
    ): Promise<AuthAccountSnapshot | undefined> =>
      (await client.mutateAccount(mutation)).account,
    [client],
  );

  const saveName = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void run("Saving…", "Display name updated.", () =>
      mutate({
        action: AUTH_ACCOUNT_MUTATION_ACTIONS.updateDisplayName,
        confirmation: AUTH_ACCOUNT_MUTATION_ACTIONS.updateDisplayName,
        displayName,
      }),
    );
  };

  const revokePasskey = (credentialId: string): void => {
    if (
      !window.confirm(
        "Revoke this passkey? You will not be able to use it again.",
      )
    )
      return;
    void run("Revoking passkey…", "Passkey revoked.", () =>
      mutate({
        action: AUTH_ACCOUNT_MUTATION_ACTIONS.revokePasskey,
        confirmation: AUTH_ACCOUNT_MUTATION_ACTIONS.revokePasskey,
        credentialId,
      }),
    );
  };

  const revokeSession = (sessionId: string): void => {
    if (!window.confirm("End this browser session?")) return;
    void run("Ending session…", "Session ended.", () =>
      mutate({
        action: AUTH_ACCOUNT_MUTATION_ACTIONS.revokeSession,
        confirmation: AUTH_ACCOUNT_MUTATION_ACTIONS.revokeSession,
        sessionId,
      }),
    );
  };

  const revokeOtherSessions = (): void => {
    if (!window.confirm("End every other browser session?")) return;
    void run("Ending other sessions…", "Other sessions ended.", () =>
      mutate({
        action: AUTH_ACCOUNT_MUTATION_ACTIONS.revokeOtherSessions,
        confirmation: AUTH_ACCOUNT_MUTATION_ACTIONS.revokeOtherSessions,
      }),
    );
  };

  const revokeAllSessions = (): void => {
    if (
      !window.confirm(
        "Sign out every session, including this one? You will need your passkey to return.",
      )
    )
      return;
    void run("Signing out everywhere…", "Signed out.", async () => {
      await client.mutateAccount({
        action: AUTH_ACCOUNT_MUTATION_ACTIONS.revokeAllSessions,
        confirmation: AUTH_ACCOUNT_MUTATION_ACTIONS.revokeAllSessions,
      });
      window.location.assign(
        `/login?return_to=${encodeURIComponent(bootstrap.routePath)}`,
      );
      return undefined;
    });
  };

  const current = account;
  const role = current?.role ?? bootstrap.role;
  const title = current?.displayName ?? bootstrap.displayName;

  return (
    <>
      <style>{styles}</style>
      <div className="account-shell">
        <header className="account-intro">
          <div>
            <p className="account-eyebrow">Private identity controls</p>
            <h1>{title}</h1>
          </div>
          <div className="role-readout">
            <span>Permission level</span>
            <strong>{role}</strong>
          </div>
        </header>

        {!current ? (
          <p className="account-loading">Reading your account…</p>
        ) : (
          <div className="account-grid">
            <div className="account-column">
              <section className="account-panel">
                <PanelHeading
                  index="01"
                  title="Display name"
                  note="Your local name for conversations and attribution. It does not alter an external profile."
                />
                <div className="panel-body">
                  <form className="name-form" onSubmit={saveName}>
                    <label htmlFor="display-name">Local account name</label>
                    <input
                      id="display-name"
                      maxLength={200}
                      autoComplete="name"
                      required
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                    />
                    <div className="button-row">
                      <button
                        className="account-button"
                        disabled={busy}
                        type="submit"
                      >
                        Save name
                      </button>
                    </div>
                  </form>
                </div>
              </section>

              <section className="account-panel">
                <PanelHeading
                  index="02"
                  title="Connected channels"
                  note="Verified connections are intentionally redacted here."
                />
                <div className="panel-body">
                  {current.connectedChannels.length === 0 ? (
                    <p className="empty">No connected channels.</p>
                  ) : (
                    <ul className="ledger">
                      {current.connectedChannels.map((channel) => (
                        <li key={`${channel.type}:${channel.label}`}>
                          <div>
                            <span className="item-title">{channel.label}</span>
                            <span className="item-meta">
                              {channel.type} · verified{" "}
                              {formatDate(channel.verifiedAt, true)}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>

              <aside className="security-note">
                <strong>Authority stays separate</strong>
                Your role, account status, channel ownership, and brain access
                grants can only be changed by an Admin.
              </aside>
            </div>

            <div className="account-column">
              <section className="account-panel">
                <PanelHeading
                  index="03"
                  title="Passkeys"
                  note="Add a discoverable passkey or retire an old one. Your final passkey is protected from revocation."
                />
                <div className="panel-body">
                  <ul className="ledger">
                    {current.passkeys.map((passkey, index) => (
                      <li key={passkey.id}>
                        <div>
                          <span className="item-title">
                            Passkey {index + 1}
                          </span>
                          <span className="item-meta">
                            {passkey.credentialBackedUp
                              ? "Synced credential"
                              : "Device credential"}{" "}
                            · added {formatDate(passkey.createdAt, true)}
                          </span>
                        </div>
                        {current.passkeys.length > 1 ? (
                          <button
                            className="account-button danger"
                            disabled={busy}
                            type="button"
                            onClick={() => revokePasskey(passkey.id)}
                          >
                            Revoke
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  <div className="button-row">
                    <button
                      className="account-button secondary"
                      disabled={busy}
                      type="button"
                      onClick={() =>
                        void run(
                          "Waiting for your authenticator…",
                          "Passkey added.",
                          client.registerPasskey,
                        )
                      }
                    >
                      Add passkey
                    </button>
                  </div>
                </div>
              </section>

              <section className="account-panel">
                <PanelHeading
                  index="04"
                  title="Signed-in sessions"
                  note="End another browser session, or sign out everywhere and authenticate again."
                />
                <div className="panel-body">
                  <ul className="ledger">
                    {current.sessions.map((session) => (
                      <li key={session.id}>
                        <div>
                          <span className="item-title">
                            Browser session
                            {session.current ? (
                              <span className="current">This session</span>
                            ) : null}
                          </span>
                          <span className="item-meta">
                            Started {formatDate(session.createdAt)}
                          </span>
                        </div>
                        {!session.current ? (
                          <button
                            className="account-button danger"
                            disabled={busy}
                            type="button"
                            onClick={() => revokeSession(session.id)}
                          >
                            End
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  <div className="button-row">
                    <button
                      className="account-button secondary"
                      disabled={
                        busy ||
                        current.sessions.every((session) => session.current)
                      }
                      type="button"
                      onClick={revokeOtherSessions}
                    >
                      End other sessions
                    </button>
                    <button
                      className="account-button danger"
                      disabled={busy}
                      type="button"
                      onClick={revokeAllSessions}
                    >
                      Sign out everywhere
                    </button>
                  </div>
                  <p
                    className={`account-status${error ? " is-error" : ""}`}
                    role="status"
                    aria-live="polite"
                  >
                    {status}
                  </p>
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function PanelHeading({
  index,
  title,
  note,
}: {
  index: string;
  title: string;
  note: string;
}): React.ReactElement {
  return (
    <header className="panel-heading">
      <span className="panel-index">{index}</span>
      <div>
        <h2>{title}</h2>
        <p>{note}</p>
      </div>
    </header>
  );
}
