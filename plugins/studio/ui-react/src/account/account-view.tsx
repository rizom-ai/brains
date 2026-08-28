/** @jsxImportSource react */

import {
  AUTH_ACCOUNT_MUTATION_ACTIONS,
  type AuthAccountMutation,
  type AuthAccountPluginSettingsMutation,
  type AuthAccountRole,
  type AuthAccountSnapshot,
} from "@brains/auth-service/account-contracts";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { getErrorMessage } from "@brains/utils/error";
import {
  AccountAccessItem,
  AccountButton,
  AccountDetailSection,
} from "./account-primitives";
import { studioEntityHref, initials, roleLabel } from "./account-format";
import detailStyles from "./account-detail.css" with { type: "text" };
import {
  fetchAccount,
  mutateAccount,
  mutatePluginSettings,
  registerPasskey,
  type AccountMutationResponse,
} from "./account-api";
import accountStyles from "./account-view.css" with { type: "text" };

export interface AccountBootstrap {
  displayName: string;
  role: AuthAccountRole;
  routePath: string;
  studioPath: string;
}

export interface AccountClient {
  fetchAccount: () => Promise<AuthAccountSnapshot>;
  mutateAccount: (
    mutation: AuthAccountMutation,
  ) => Promise<AccountMutationResponse>;
  mutatePluginSettings: (
    mutation: AuthAccountPluginSettingsMutation,
  ) => Promise<AuthAccountSnapshot>;
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
  mutatePluginSettings,
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
  return getErrorMessage(error, "Account request failed");
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
      <style>
        {detailStyles}
        {accountStyles}
      </style>
      <div className="account-shell">
        <header className="account-hero">
          <div>
            <h1>Account</h1>
            <p>identity · passkeys · sessions</p>
          </div>
          <div className="account-hero-meta">
            <span>
              signed in as <strong>{title}</strong>
            </span>
            <span>
              permission <strong>{role}</strong>
            </span>
          </div>
        </header>
        <p
          className={`account-status${error ? " is-error" : ""}`}
          role="status"
          aria-live="polite"
        >
          {status}
        </p>

        {!current ? (
          <p className="account-loading">Reading your account…</p>
        ) : (
          <section className="card people-detail" aria-live="polite">
            <div className="people-detail-identity">
              <div className="people-detail-person">
                <span className="people-avatar people-avatar--large">
                  {initials(title)}
                </span>
                <span>
                  <span className="people-detail-name">{title}</span>
                  <span className="people-detail-id">
                    your account · self-service
                  </span>
                </span>
              </div>
              <div className="people-facets" aria-label="Account facets">
                <div className="people-facet">
                  <span>Role</span>
                  <strong
                    className={`people-facet-role people-facet-role--${role}`}
                  >
                    {roleLabel(role)}
                  </strong>
                </div>
                <div className="people-facet">
                  <span>Passkeys</span>
                  <strong>{current.passkeys.length}</strong>
                </div>
              </div>
            </div>

            <div className="people-detail-sections">
              {current.profileEntityId ? (
                <AccountDetailSection
                  title="Display name"
                  description="Managed by the Anchor profile — your account name follows the published profile."
                >
                  <AccountAccessItem
                    kind="Anchor profile"
                    value={title}
                    action={
                      studioEntityHref(
                        bootstrap.studioPath,
                        current.profileEntityId,
                      ) ? (
                        <a
                          className="people-text-action"
                          href={studioEntityHref(
                            bootstrap.studioPath,
                            current.profileEntityId,
                          )}
                        >
                          Edit in Studio →
                        </a>
                      ) : undefined
                    }
                  />
                </AccountDetailSection>
              ) : (
                <AccountDetailSection
                  title="Display name"
                  description="Your local name for conversations and attribution. It does not alter an external profile."
                >
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
                    <AccountButton type="submit" tone="primary" disabled={busy}>
                      Save name
                    </AccountButton>
                  </form>
                </AccountDetailSection>
              )}

              <AccountDetailSection
                title="Connected channels"
                description="Verified contact details connected to your account."
              >
                {current.connectedChannels.length === 0 ? (
                  <p className="people-empty">No connected channels.</p>
                ) : (
                  current.connectedChannels.map((channel) => (
                    <AccountAccessItem
                      key={`${channel.type}:${channel.label}`}
                      kind={channel.type}
                      value={`${channel.label} · verified ${formatDate(channel.verifiedAt, true)}`}
                    />
                  ))
                )}
              </AccountDetailSection>

              {current.pluginSettings.map((settings) => (
                <AccountDetailSection
                  key={settings.id}
                  title={settings.title}
                  description={
                    settings.description ?? "Private settings for this account."
                  }
                >
                  <form
                    key={`${settings.id}:${settings.revision ?? "unset"}`}
                    className="name-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const formData = new FormData(event.currentTarget);
                      const values: Record<string, unknown> =
                        Object.fromEntries(formData.entries());
                      for (const field of settings.fields) {
                        if (field.control === "checkbox") {
                          values[field.name] = formData.has(field.name);
                        } else if (
                          field.control === "number" &&
                          typeof values[field.name] === "string" &&
                          values[field.name] !== ""
                        ) {
                          values[field.name] = Number(values[field.name]);
                        }
                      }
                      void run(
                        `Saving ${settings.title}…`,
                        `${settings.title} updated.`,
                        () =>
                          client.mutatePluginSettings({
                            action: "save",
                            definitionId: settings.id,
                            values,
                          }),
                      );
                    }}
                  >
                    {settings.fields.map((field) => (
                      <label
                        key={field.name}
                        htmlFor={`setting-${settings.id}-${field.name}`}
                      >
                        {field.label}
                        {field.control === "checkbox" ? (
                          <input
                            id={`setting-${settings.id}-${field.name}`}
                            name={field.name}
                            type="checkbox"
                            defaultChecked={field.value === true}
                          />
                        ) : (
                          <input
                            id={`setting-${settings.id}-${field.name}`}
                            name={field.name}
                            type={
                              field.secret
                                ? "password"
                                : field.control === "url"
                                  ? "url"
                                  : field.control === "number"
                                    ? "number"
                                    : "text"
                            }
                            required={
                              field.required &&
                              (!settings.configured || field.secret) &&
                              !field.set
                            }
                            defaultValue={
                              field.secret
                                ? ""
                                : typeof field.value === "string" ||
                                    typeof field.value === "number"
                                  ? field.value
                                  : ""
                            }
                            placeholder={
                              field.secret && field.set
                                ? "Stored — leave blank to keep"
                                : undefined
                            }
                            autoComplete="off"
                          />
                        )}
                      </label>
                    ))}
                    <div className="people-inline-actions">
                      <AccountButton
                        type="submit"
                        tone="primary"
                        disabled={busy}
                      >
                        Save settings
                      </AccountButton>
                      {settings.configured ? (
                        <button
                          className="people-text-action people-text-action--danger"
                          disabled={busy}
                          type="button"
                          onClick={() => {
                            if (!window.confirm(`Remove ${settings.title}?`)) {
                              return;
                            }
                            void run(
                              `Removing ${settings.title}…`,
                              `${settings.title} removed.`,
                              () =>
                                client.mutatePluginSettings({
                                  action: "delete",
                                  definitionId: settings.id,
                                }),
                            );
                          }}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  </form>
                </AccountDetailSection>
              ))}

              <AccountDetailSection
                title="Sign-in"
                description="Passkeys used to access this account. Your final passkey is protected from revocation."
              >
                {current.passkeys.map((passkey) => (
                  <AccountAccessItem
                    key={passkey.id}
                    kind="Passkey"
                    value={`${passkey.credentialBackedUp ? "Synced credential" : "Device credential"} · added ${formatDate(passkey.createdAt, true)}`}
                    action={
                      current.passkeys.length > 1 ? (
                        <button
                          className="people-text-action people-text-action--danger"
                          disabled={busy}
                          type="button"
                          onClick={() => revokePasskey(passkey.id)}
                        >
                          Revoke
                        </button>
                      ) : undefined
                    }
                  />
                ))}
                <div className="people-inline-actions">
                  <button
                    className="people-text-action"
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
              </AccountDetailSection>

              <AccountDetailSection
                title="Signed-in sessions"
                description="Browser sessions signed in to this account."
              >
                {current.sessions.map((session) => (
                  <AccountAccessItem
                    key={session.id}
                    kind={session.current ? "This session" : "Browser session"}
                    value={`Started ${formatDate(session.createdAt)}`}
                    action={
                      !session.current ? (
                        <button
                          className="people-text-action people-text-action--danger"
                          disabled={busy}
                          type="button"
                          onClick={() => revokeSession(session.id)}
                        >
                          End
                        </button>
                      ) : undefined
                    }
                  />
                ))}
              </AccountDetailSection>
            </div>

            <footer className="people-detail-footer">
              <small>
                Your role, account status, channel ownership, and brain access
                grants can only be changed by an Admin.
              </small>
              <div className="people-detail-footer-actions">
                <AccountButton
                  disabled={
                    busy || current.sessions.every((session) => session.current)
                  }
                  onClick={revokeOtherSessions}
                >
                  End other sessions
                </AccountButton>
                <AccountButton
                  tone="danger"
                  disabled={busy}
                  onClick={revokeAllSessions}
                >
                  Sign out everywhere
                </AccountButton>
              </div>
            </footer>
          </section>
        )}
      </div>
    </>
  );
}
