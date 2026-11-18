/** @jsxImportSource react */
import { Button, Input, Switch } from "@brains/app-ui-react";
import type {
  AuthAccountAppPassword,
  AuthAccountSnapshot,
} from "@brains/contracts";
import { useState, type ReactElement } from "react";
import {
  accountClass,
  accountStyles as accountLayout,
} from "../studio-account.styles";
import { aiToolsStyles as s } from "../studio-ai-tools.styles";
import { ClientCard, Snippet } from "./account-ai-tools";
import { accountTimestamp } from "./account-format";
import { AccountAccessItem, AccountDetailSection } from "./account-primitives";
import { driveClients } from "./drive-clients";
import type { AccountActions } from "./use-account-actions";

const LABEL_FIELD = "app-password-label";
const WRITE_FIELD = "app-password-write";

/** App password times arrive in seconds; the day is what a person plans by. */
function day(seconds: number): string {
  return accountTimestamp(seconds).slice(0, 10);
}

function appPasswordDates(
  appPassword: AuthAccountAppPassword,
  nowSeconds: number,
): string[] {
  return [
    `Created: ${day(appPassword.createdAt)}`,
    `${appPassword.expiresAt <= nowSeconds ? "Expired" : "Expires"}: ${day(appPassword.expiresAt)}`,
    appPassword.lastUsedAt === undefined
      ? "Never used"
      : `Last used: ${day(appPassword.lastUsedAt)}`,
  ];
}

/**
 * The brain as a network drive: its address, the app passwords that sign a
 * mount in, and the steps for each client.
 */
export function AccountDriveTab(props: {
  davUrl: string;
  account: AuthAccountSnapshot;
  actions: AccountActions;
}): ReactElement {
  const { account, actions } = props;
  const { busy, createdAppPassword } = actions;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const [allowSaving, setAllowSaving] = useState(false);
  const clients = driveClients(props.davUrl);
  const fileManagers = clients.filter(
    (client) => client.group === "file-manager",
  );
  const commandLine = clients.filter(
    (client) => client.group === "command-line",
  );
  return (
    <div className={accountClass("", accountLayout.column)}>
      <AccountDetailSection
        title="Drive"
        description="Mount this brain as a network drive. It shows the notes, posts and files you can see here, as folders and files, to open and edit on your computer."
      >
        <article className={accountClass("drive-address", s.client)}>
          <h4 className={accountClass("", s.clientName)}>
            Your brain’s drive address
          </h4>
          <Snippet label="drive address" code={props.davUrl} />
        </article>
      </AccountDetailSection>

      <AccountDetailSection
        title="App passwords"
        description="A mount signs in with an app password instead of your passkey. It works only for the drive, expires after a year and can be revoked here. It can only read unless you allow saving changes."
      >
        {createdAppPassword ? (
          <article
            data-app-password-reveal
            className={accountClass("drive-reveal", s.client)}
          >
            <h4 className={accountClass("", s.clientName)}>
              Your new app password
            </h4>
            <p className={accountClass("", s.text)}>
              Copy both now. The password is shown only once.
            </p>
            <Snippet label="username" code={createdAppPassword.username} />
            <Snippet label="password" code={createdAppPassword.password} />
            <div
              className={accountClass(
                "people-inline-actions",
                accountLayout.inlineActions,
              )}
            >
              <Button
                variant="outline"
                type="button"
                onClick={actions.dismissCreatedAppPassword}
              >
                Done
              </Button>
            </div>
          </article>
        ) : null}
        {account.appPasswords.length === 0 ? (
          <p className={accountClass("", s.text)}>No app passwords yet.</p>
        ) : (
          account.appPasswords.map((appPassword) => (
            <AccountAccessItem
              key={appPassword.id}
              kind={appPassword.label}
              description={`${appPassword.username} · ${appPassword.access === "write" ? "Read and write" : "Read-only"}`}
              metadata={appPasswordDates(appPassword, nowSeconds)}
              action={
                <Button
                  variant="danger"
                  disabled={busy}
                  type="button"
                  onClick={() => actions.revokeAppPassword(appPassword.id)}
                >
                  Revoke
                </Button>
              }
            />
          ))
        )}
        <form
          className={accountClass("name-form", accountLayout.form)}
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const label = String(new FormData(form).get(LABEL_FIELD) ?? "");
            if (label.trim() === "") return;
            actions.createAppPassword(
              label.trim(),
              allowSaving ? "write" : "read",
            );
            form.reset();
            setAllowSaving(false);
          }}
        >
          <label
            htmlFor={LABEL_FIELD}
            className={accountClass("", accountLayout.field)}
          >
            <span className={accountClass("", accountLayout.formLabel)}>
              Name it after the computer it is for
            </span>
            <Input
              id={LABEL_FIELD}
              name={LABEL_FIELD}
              type="text"
              required
              maxLength={100}
              placeholder="Laptop"
              autoComplete="off"
            />
          </label>
          <label
            htmlFor={WRITE_FIELD}
            className={accountClass("", accountLayout.field)}
          >
            <span className={accountClass("", accountLayout.formLabel)}>
              Allow saving changes
            </span>
            <Switch
              id={WRITE_FIELD}
              aria-label="Allow saving changes"
              checked={allowSaving}
              onCheckedChange={setAllowSaving}
            />
          </label>
          <div
            className={accountClass(
              "people-inline-actions",
              accountLayout.inlineActions,
            )}
          >
            <Button variant="outline" disabled={busy} type="submit">
              New app password
            </Button>
          </div>
        </form>
      </AccountDetailSection>

      <AccountDetailSection
        title="Connect your computer"
        description="Use your computer’s own file manager. The brain then appears as a drive beside your other folders."
      >
        <div className={accountClass("drive-clients", s.clients)}>
          {fileManagers.map((client) => (
            <ClientCard key={client.id} client={client} />
          ))}
        </div>
        <details className={accountClass("drive-command-line", s.developer)}>
          <summary className={accountClass("", s.developerSummary)}>
            Command line
            <span className={accountClass("", s.developerHint)}>
              {commandLine.map((client) => client.name).join(", ")}
            </span>
          </summary>
          <div
            className={accountClass(
              "drive-command-line-clients",
              s.clients,
              s.developerClients,
            )}
          >
            {commandLine.map((client) => (
              <ClientCard key={client.id} client={client} />
            ))}
          </div>
        </details>
      </AccountDetailSection>
    </div>
  );
}
