import { useCallback, useEffect, useState } from "react";
import {
  AUTH_ACCOUNT_MUTATION_ACTIONS,
  type AuthAccountMutation,
  type AuthAccountPluginSettingsForm,
  type AuthAccountSnapshot,
} from "@brains/auth-service/account-contracts";
import { getErrorMessage } from "@brains/utils/error";
import type { AccountClient } from "./account-api";
import { settingsFormValues } from "./account-settings";

export interface AccountConfirmation {
  title: string;
  message: string;
  confirmLabel: string;
  action: () => void;
}

interface ConfirmedMutationCopy {
  title: string;
  message: string;
  confirmLabel: string;
  pending: string;
  complete: string;
}

/** The copy for each account change that asks before it runs. */
const CONFIRMED_MUTATIONS = {
  revokePasskey: {
    title: "Revoke this passkey?",
    message: "You will not be able to use this passkey again.",
    confirmLabel: "Revoke passkey",
    pending: "Revoking passkey…",
    complete: "Passkey revoked.",
  },
  revokeSession: {
    title: "End this browser session?",
    message: "That browser will need a passkey to sign in again.",
    confirmLabel: "End session",
    pending: "Ending session…",
    complete: "Session ended.",
  },
  revokeOtherSessions: {
    title: "End every other browser session?",
    message: "Your current browser will remain signed in.",
    confirmLabel: "End other sessions",
    pending: "Ending other sessions…",
    complete: "Other sessions ended.",
  },
} satisfies Record<string, ConfirmedMutationCopy>;

function messageOf(error: unknown): string {
  return getErrorMessage(error, "Account request failed");
}

export interface AccountActionsInput {
  client: AccountClient;
  initialAccount: AuthAccountSnapshot | undefined;
  initialDisplayName: string;
  /** Where to come back to after signing out everywhere. */
  routePath: string;
}

export interface AccountActions {
  account: AuthAccountSnapshot | undefined;
  displayName: string;
  setDisplayName: (value: string) => void;
  status: string;
  error: boolean;
  busy: boolean;
  confirmation: AccountConfirmation | null;
  cancelConfirmation: () => void;
  confirm: () => void;
  saveName: () => void;
  addPasskey: () => void;
  revokePasskey: (credentialId: string) => void;
  revokeSession: (sessionId: string) => void;
  revokeOtherSessions: () => void;
  revokeAllSessions: () => void;
  saveSettings: (
    settings: AuthAccountPluginSettingsForm,
    formData: FormData,
  ) => void;
  removeSettings: (settings: AuthAccountPluginSettingsForm) => void;
}

/**
 * The signed-in account and every change the Account page can make to it.
 * Each change reports its progress in one status line; destructive ones ask
 * first through a single pending confirmation.
 */
export function useAccountActions(input: AccountActionsInput): AccountActions {
  const { client, initialAccount } = input;
  const [account, setAccount] = useState(initialAccount);
  const [displayName, setDisplayName] = useState(
    initialAccount?.displayName ?? input.initialDisplayName,
  );
  const [status, setStatus] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<AccountConfirmation | null>(
    null,
  );

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

  const mutate = async (
    mutation: AuthAccountMutation,
  ): Promise<AuthAccountSnapshot | undefined> =>
    (await client.mutateAccount(mutation)).account;

  const confirmMutation = (
    copy: ConfirmedMutationCopy,
    mutation: AuthAccountMutation,
  ): void =>
    setConfirmation({
      title: copy.title,
      message: copy.message,
      confirmLabel: copy.confirmLabel,
      action: () => {
        void run(copy.pending, copy.complete, () => mutate(mutation));
      },
    });

  return {
    account,
    displayName,
    setDisplayName,
    status,
    error,
    busy,
    confirmation,
    cancelConfirmation: () => setConfirmation(null),
    confirm: (): void => {
      if (!confirmation) return;
      setConfirmation(null);
      confirmation.action();
    },
    saveName: (): void => {
      void run("Saving…", "Display name updated.", () =>
        mutate({
          action: AUTH_ACCOUNT_MUTATION_ACTIONS.updateDisplayName,
          confirmation: AUTH_ACCOUNT_MUTATION_ACTIONS.updateDisplayName,
          displayName,
        }),
      );
    },
    addPasskey: (): void => {
      void run("Waiting for your authenticator…", "Passkey added.", () =>
        client.registerPasskey(),
      );
    },
    revokePasskey: (credentialId) =>
      confirmMutation(CONFIRMED_MUTATIONS.revokePasskey, {
        action: AUTH_ACCOUNT_MUTATION_ACTIONS.revokePasskey,
        confirmation: AUTH_ACCOUNT_MUTATION_ACTIONS.revokePasskey,
        credentialId,
      }),
    revokeSession: (sessionId) =>
      confirmMutation(CONFIRMED_MUTATIONS.revokeSession, {
        action: AUTH_ACCOUNT_MUTATION_ACTIONS.revokeSession,
        confirmation: AUTH_ACCOUNT_MUTATION_ACTIONS.revokeSession,
        sessionId,
      }),
    revokeOtherSessions: () =>
      confirmMutation(CONFIRMED_MUTATIONS.revokeOtherSessions, {
        action: AUTH_ACCOUNT_MUTATION_ACTIONS.revokeOtherSessions,
        confirmation: AUTH_ACCOUNT_MUTATION_ACTIONS.revokeOtherSessions,
      }),
    // Ending this session too, so the page leaves for the login instead of
    // showing an account it can no longer read.
    revokeAllSessions: () =>
      setConfirmation({
        title: "Sign out everywhere?",
        message:
          "This ends every session, including this one. You will need your passkey to return.",
        confirmLabel: "Sign out everywhere",
        action: () => {
          void run("Signing out everywhere…", "Signed out.", async () => {
            await client.mutateAccount({
              action: AUTH_ACCOUNT_MUTATION_ACTIONS.revokeAllSessions,
              confirmation: AUTH_ACCOUNT_MUTATION_ACTIONS.revokeAllSessions,
            });
            window.location.assign(
              `/login?return_to=${encodeURIComponent(input.routePath)}`,
            );
            return undefined;
          });
        },
      }),
    saveSettings: (settings, formData): void => {
      const values = settingsFormValues(settings.fields, formData);
      void run(`Saving ${settings.title}…`, `${settings.title} updated.`, () =>
        client.mutatePluginSettings({
          action: "save",
          definitionId: settings.id,
          values,
        }),
      );
    },
    removeSettings: (settings) =>
      setConfirmation({
        title: `Remove ${settings.title}?`,
        message:
          "The stored settings for this integration will be removed from your account only.",
        confirmLabel: "Remove settings",
        action: () => {
          void run(
            `Removing ${settings.title}…`,
            `${settings.title} removed.`,
            () =>
              client.mutatePluginSettings({
                action: "delete",
                definitionId: settings.id,
              }),
          );
        },
      }),
  };
}
