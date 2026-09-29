/** @jsxImportSource react */
import { Button, Input, Switch } from "@brains/app-ui-react";
import type { AuthAccountSnapshot } from "@brains/auth-service/account-contracts";
import { OperatorCard } from "@brains/operator-view-react";
import type { ReactElement } from "react";
import { studioWorkspacePath } from "../../../src/studio-paths";
import {
  accountClass,
  accountStyles as accountLayout,
} from "../studio-account.styles";
import { typographyStyles } from "../studio-typography.styles";
import {
  accountTimestamp,
  initials,
  roleLabel,
  studioEntityHref,
} from "./account-format";
import {
  AccountAccessItem,
  AccountButton,
  AccountDetailSection,
} from "./account-primitives";
import { settingInputType } from "./account-settings";
import type { AccountActions } from "./use-account-actions";

interface AccountTabProps {
  account: AuthAccountSnapshot;
  actions: AccountActions;
}

/** Who you are here: name, role, and where the name is managed. */
export function AccountProfileTab(
  props: AccountTabProps & { title: string; studioPath: string },
): ReactElement {
  const { account, actions, title, studioPath } = props;
  const role = account.role;
  const profileHref = account.profileEntityId
    ? studioEntityHref(studioPath, account.profileEntityId)
    : undefined;
  return (
    <>
      <AccountDetailSection title="Profile">
        <div
          className={accountClass("account-identity", accountLayout.identity)}
        >
          <div
            className={accountClass(
              "people-detail-person",
              accountLayout.person,
            )}
          >
            <span
              className={accountClass(
                "people-avatar people-avatar--large",
                accountLayout.avatar,
              )}
            >
              {initials(title)}
            </span>
            <span className={accountClass("", accountLayout.personCopy)}>
              <span
                className={accountClass(
                  "people-detail-name",
                  accountLayout.name,
                  typographyStyles.secondaryDisplay,
                )}
              >
                {title}
              </span>
              <span
                data-account-role={role}
                className={accountClass("account-role", accountLayout.role)}
              >
                {roleLabel(role)}
              </span>
            </span>
          </div>
        </div>

        {account.profileEntityId ? (
          <>
            <p
              className={accountClass(
                "account-profile-note",
                accountLayout.description,
              )}
            >
              Managed by the Anchor profile — your account name follows the
              published profile.
            </p>
            <AccountAccessItem
              kind="Anchor profile"
              description={title}
              action={
                profileHref ? (
                  <Button asChild variant="link">
                    <a href={profileHref}>Edit in Studio →</a>
                  </Button>
                ) : undefined
              }
            />
          </>
        ) : (
          <form
            className={accountClass("name-form", accountLayout.form)}
            onSubmit={(event) => {
              event.preventDefault();
              actions.saveName();
            }}
          >
            <label
              className={accountClass("", accountLayout.formLabel)}
              htmlFor="display-name"
            >
              Display name
            </label>
            <Input
              id="display-name"
              maxLength={200}
              autoComplete="name"
              required
              value={actions.displayName}
              onChange={(event) => actions.setDisplayName(event.target.value)}
            />
            <AccountButton type="submit" disabled={actions.busy}>
              Save name
            </AccountButton>
          </form>
        )}
      </AccountDetailSection>

      <p className={accountClass("", accountLayout.description)}>
        Your role controls access to this brain. An administrator manages access
        in Administration.
      </p>
      {role === "admin" && (
        <Button asChild variant="outline">
          <a href={studioWorkspacePath(studioPath, "admin:administration")}>
            Manage people in Administration →
          </a>
        </Button>
      )}
    </>
  );
}

/** The channel identities this brain recognises as you. */
export function AccountIdentitiesTab(
  props: Pick<AccountTabProps, "account">,
): ReactElement {
  const channels = props.account.connectedChannels;
  return (
    <AccountDetailSection
      title="Linked identities"
      description="How this brain recognises messages from you. These are your identities, not services configured for the whole brain."
    >
      {channels.length === 0 ? (
        <p className={accountClass("people-empty", accountLayout.empty)}>
          No linked identities.
        </p>
      ) : (
        channels.map((channel) => (
          <AccountAccessItem
            key={`${channel.type}:${channel.label}`}
            kind={channel.type}
            description={channel.label}
            metadata={[
              `Verified: ${accountTimestamp(channel.verifiedAt, true)}`,
            ]}
          />
        ))
      )}
    </AccountDetailSection>
  );
}

/** Per-account settings forms that plugins declare. */
export function AccountSettingsTab(props: AccountTabProps): ReactElement {
  const { account, actions } = props;
  return (
    <>
      <p className={accountClass("", accountLayout.description)}>
        Settings for your account only. These do not configure shared services
        for the brain.
      </p>
      {account.pluginSettings.map((settings) => (
        <OperatorCard
          key={settings.id}
          label={settings.title}
          density="comfortable"
          presentation="disclosure"
        >
          <p
            className={accountClass(
              "account-settings-description",
              accountLayout.description,
            )}
          >
            {settings.description ?? "Private settings for this account."}
          </p>
          <form
            key={`${settings.id}:${settings.revision ?? "unset"}`}
            className={accountClass("name-form", accountLayout.form)}
            onSubmit={(event) => {
              event.preventDefault();
              actions.saveSettings(settings, new FormData(event.currentTarget));
            }}
          >
            {settings.fields.map((field) => (
              <label
                key={field.name}
                htmlFor={`setting-${settings.id}-${field.name}`}
                className={accountClass("", accountLayout.field)}
              >
                <span className={accountClass("", accountLayout.formLabel)}>
                  {field.label}
                </span>
                {field.control === "checkbox" ? (
                  <Switch
                    id={`setting-${settings.id}-${field.name}`}
                    name={field.name}
                    defaultChecked={field.value === true}
                  />
                ) : (
                  <Input
                    id={`setting-${settings.id}-${field.name}`}
                    name={field.name}
                    type={settingInputType(field)}
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
            <div
              className={accountClass(
                "people-inline-actions",
                accountLayout.inlineActions,
              )}
            >
              <AccountButton
                type="submit"
                tone="primary"
                disabled={actions.busy}
              >
                Save settings
              </AccountButton>
              {settings.configured ? (
                <Button
                  variant="danger"
                  disabled={actions.busy}
                  type="button"
                  onClick={() => actions.removeSettings(settings)}
                >
                  Remove
                </Button>
              ) : null}
            </div>
          </form>
        </OperatorCard>
      ))}
    </>
  );
}

/** Passkeys and browser sessions, and ending them. */
export function AccountSecurityTab(props: AccountTabProps): ReactElement {
  const { account, actions } = props;
  const { busy } = actions;
  return (
    <div className={accountClass("", accountLayout.column)}>
      <AccountDetailSection
        title="Sign-in"
        description="Passkeys used to access this account. Your final passkey is protected from revocation."
      >
        {account.passkeys.map((passkey) => (
          <AccountAccessItem
            key={passkey.id}
            kind={
              passkey.credentialBackedUp ? "Synced passkey" : "Device passkey"
            }
            metadata={[`Added: ${accountTimestamp(passkey.createdAt, true)}`]}
            action={
              account.passkeys.length > 1 ? (
                <Button
                  variant="danger"
                  disabled={busy}
                  type="button"
                  onClick={() => actions.revokePasskey(passkey.id)}
                >
                  Revoke
                </Button>
              ) : undefined
            }
          />
        ))}
        <div
          className={accountClass(
            "people-inline-actions",
            accountLayout.inlineActions,
          )}
        >
          <Button
            variant="outline"
            disabled={busy}
            type="button"
            onClick={actions.addPasskey}
          >
            Add passkey
          </Button>
        </div>
      </AccountDetailSection>

      <AccountDetailSection title="Signed-in sessions">
        {account.sessions.map((session) => (
          <AccountAccessItem
            key={session.id}
            kind={session.current ? "This session" : "Browser session"}
            metadata={[
              `Started: ${accountTimestamp(session.createdAt)}`,
              ...(session.current ? ["Current browser"] : []),
            ]}
            action={
              !session.current ? (
                <Button
                  variant="danger"
                  disabled={busy}
                  type="button"
                  onClick={() => actions.revokeSession(session.id)}
                >
                  End
                </Button>
              ) : undefined
            }
          />
        ))}
      </AccountDetailSection>
      <footer
        className={accountClass(
          "account-session-actions",
          accountLayout.footer,
        )}
      >
        <small>Access changes require an Admin.</small>
        <div className={accountClass("", accountLayout.actions)}>
          <AccountButton
            disabled={
              busy || account.sessions.every((session) => session.current)
            }
            onClick={actions.revokeOtherSessions}
          >
            End other sessions
          </AccountButton>
          <AccountButton
            tone="danger"
            disabled={busy}
            onClick={actions.revokeAllSessions}
          >
            Sign out everywhere
          </AccountButton>
        </div>
      </footer>
    </div>
  );
}
