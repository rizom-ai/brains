/** @jsxImportSource react */
import { headStyles } from "../studio-page-head.styles";
import {
  ConfirmDialog,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@brains/app-ui-react";
import {
  accountClass,
  accountStyles as accountLayout,
} from "../studio-account.styles";
import type {
  AuthAccountRole,
  AuthAccountSnapshot,
} from "@brains/auth-service/account-contracts";
import { useMemo, useState } from "react";
import { AccountClient } from "./account-api";
import {
  AccountIdentitiesTab,
  AccountProfileTab,
  AccountSecurityTab,
  AccountSettingsTab,
} from "./account-tabs";
import { AccountAiToolsTab } from "./account-ai-tools";
import { useAccountActions } from "./use-account-actions";
import { useStudioApi } from "../studio-api-context";
import { StudioPageHead, studioAccessRequirement } from "../studio-page-head";

export interface AccountBootstrap {
  displayName: string;
  role: AuthAccountRole;
  routePath: string;
  studioPath: string;
  /** This brain's MCP address, present when the person can connect AI tools. */
  mcpUrl?: string | undefined;
  /** Tab to open first, from the `section` query parameter. */
  initialSection?: string | undefined;
}

const ACCOUNT_SECTIONS = [
  "profile",
  "security",
  "identities",
  "settings",
  "ai-tools",
] as const;

function openingSection(bootstrap: AccountBootstrap): string {
  const requested = ACCOUNT_SECTIONS.find(
    (section) => section === bootstrap.initialSection,
  );
  if (!requested || (requested === "ai-tools" && !bootstrap.mcpUrl)) {
    return "profile";
  }
  return requested;
}

export interface AccountAppProps {
  bootstrap: AccountBootstrap;
  initialAccount?: AuthAccountSnapshot;
  /** Defaults to a client on the provided Studio transport. */
  client?: AccountClient | undefined;
}

export function AccountApp({
  bootstrap,
  initialAccount,
  client: providedClient,
}: AccountAppProps): React.ReactElement {
  const api = useStudioApi();
  const client = useMemo(
    () => providedClient ?? new AccountClient({ fetch: api.fetch }),
    [providedClient, api],
  );
  const actions = useAccountActions({
    client,
    initialAccount,
    initialDisplayName: bootstrap.displayName,
    routePath: bootstrap.routePath,
  });
  const { account: current, status, error, busy, confirmation } = actions;
  const [section, setSection] = useState(() => openingSection(bootstrap));
  const title = current?.displayName ?? bootstrap.displayName;

  return (
    <>
      <div
        className={accountClass(
          "account-shell",
          accountLayout.shell,
          headStyles.inset,
        )}
      >
        <StudioPageHead
          model={{
            access: studioAccessRequirement("public"),
            title: "Your account",
            totals: [],
          }}
        />
        <p className={accountClass("account-scope", accountLayout.description)}>
          {bootstrap.mcpUrl
            ? "Your account on this brain. Manage your profile, sign-in security, linked identities, personal settings and AI tools here—not shared services or other people’s access."
            : "Your account on this brain. Manage your profile, sign-in security, linked identities, and personal settings here—not shared services or other people’s access."}
        </p>
        <p
          className={accountClass(
            `account-status${error ? " is-error" : ""}`,
            accountLayout.feedback,
            error && accountLayout.feedbackError,
          )}
          role="status"
          aria-live="polite"
        >
          {status}
        </p>

        {!current ? (
          <p className={accountClass("account-loading", accountLayout.loading)}>
            Reading your account…
          </p>
        ) : (
          <Tabs
            className="account-details"
            value={section}
            onValueChange={setSection}
          >
            <TabsList
              aria-label="Account sections"
              className={accountClass("account-tabs", accountLayout.tabs)}
            >
              <TabsTrigger value="profile" disabled={busy}>
                Profile
              </TabsTrigger>
              <TabsTrigger value="security" disabled={busy}>
                Sign-in &amp; sessions
              </TabsTrigger>
              <TabsTrigger value="identities" disabled={busy}>
                Linked identities
              </TabsTrigger>
              {current.pluginSettings.length > 0 && (
                <TabsTrigger value="settings" disabled={busy}>
                  Personal settings
                </TabsTrigger>
              )}
              {bootstrap.mcpUrl && (
                <TabsTrigger value="ai-tools" disabled={busy}>
                  AI tools
                </TabsTrigger>
              )}
            </TabsList>
            <TabsContent
              value="profile"
              forceMount
              hidden={section !== "profile"}
              className={accountClass(
                "account-detail-sections",
                accountLayout.tabPanel,
              )}
            >
              <AccountProfileTab
                account={current}
                actions={actions}
                title={title}
                studioPath={bootstrap.studioPath}
              />
            </TabsContent>
            <TabsContent
              value="identities"
              forceMount
              hidden={section !== "identities"}
              className={accountClass("", accountLayout.tabPanel)}
            >
              <AccountIdentitiesTab account={current} />
            </TabsContent>
            {current.pluginSettings.length > 0 && (
              <TabsContent
                value="settings"
                forceMount
                hidden={section !== "settings"}
                className={accountClass("", accountLayout.tabPanel)}
              >
                <AccountSettingsTab account={current} actions={actions} />
              </TabsContent>
            )}
            <TabsContent
              value="security"
              forceMount
              hidden={section !== "security"}
              className={accountClass("", accountLayout.tabPanel)}
            >
              <AccountSecurityTab account={current} actions={actions} />
            </TabsContent>
            {bootstrap.mcpUrl && (
              <TabsContent
                value="ai-tools"
                forceMount
                hidden={section !== "ai-tools"}
                className={accountClass("", accountLayout.tabPanel)}
              >
                <AccountAiToolsTab mcpUrl={bootstrap.mcpUrl} />
              </TabsContent>
            )}
          </Tabs>
        )}
      </div>
      {confirmation && (
        <ConfirmDialog
          mark="!"
          title={confirmation.title}
          titleId="account-confirmation-title"
          cancelLabel="Cancel"
          confirmLabel={confirmation.confirmLabel}
          confirmVariant="danger"
          pending={busy}
          onCancel={actions.cancelConfirmation}
          onConfirm={actions.confirm}
        >
          <p>{confirmation.message}</p>
        </ConfirmDialog>
      )}
    </>
  );
}
