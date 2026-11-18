import type { AuthAppPasswordAccess } from "./auth-access";

/** Browser-safe, session-derived own-account contracts. */
export const AUTH_ACCOUNT_MUTATION_ACTIONS = {
  updateDisplayName: "updateDisplayName",
  revokePasskey: "revokePasskey",
  revokeSession: "revokeSession",
  revokeOtherSessions: "revokeOtherSessions",
  revokeAllSessions: "revokeAllSessions",
  createAppPassword: "createAppPassword",
  revokeAppPassword: "revokeAppPassword",
} as const;

export type AuthAccountRole = "admin" | "trusted" | "public";

export type AuthAccountMutation =
  | {
      action: typeof AUTH_ACCOUNT_MUTATION_ACTIONS.updateDisplayName;
      confirmation: typeof AUTH_ACCOUNT_MUTATION_ACTIONS.updateDisplayName;
      displayName: string;
    }
  | {
      action: typeof AUTH_ACCOUNT_MUTATION_ACTIONS.revokePasskey;
      confirmation: typeof AUTH_ACCOUNT_MUTATION_ACTIONS.revokePasskey;
      credentialId: string;
    }
  | {
      action: typeof AUTH_ACCOUNT_MUTATION_ACTIONS.revokeSession;
      confirmation: typeof AUTH_ACCOUNT_MUTATION_ACTIONS.revokeSession;
      sessionId: string;
    }
  | {
      action: typeof AUTH_ACCOUNT_MUTATION_ACTIONS.revokeOtherSessions;
      confirmation: typeof AUTH_ACCOUNT_MUTATION_ACTIONS.revokeOtherSessions;
    }
  | {
      action: typeof AUTH_ACCOUNT_MUTATION_ACTIONS.revokeAllSessions;
      confirmation: typeof AUTH_ACCOUNT_MUTATION_ACTIONS.revokeAllSessions;
    }
  | {
      action: typeof AUTH_ACCOUNT_MUTATION_ACTIONS.createAppPassword;
      confirmation: typeof AUTH_ACCOUNT_MUTATION_ACTIONS.createAppPassword;
      label: string;
      /** Read-only when omitted. */
      access?: AuthAppPasswordAccess | undefined;
    }
  | {
      action: typeof AUTH_ACCOUNT_MUTATION_ACTIONS.revokeAppPassword;
      confirmation: typeof AUTH_ACCOUNT_MUTATION_ACTIONS.revokeAppPassword;
      appPasswordId: string;
    };

/** An app password as its owner sees it afterwards: never the password. */
export interface AuthAccountAppPassword {
  id: string;
  username: string;
  label: string;
  access: AuthAppPasswordAccess;
  createdAt: number;
  expiresAt: number;
  lastUsedAt?: number | undefined;
}

/** Returned once, by the mutation that created the app password. */
export interface AuthAccountAppPasswordSecret {
  username: string;
  password: string;
}

export interface AuthAccountPasskey {
  id: string;
  transports?: string[] | undefined;
  credentialDeviceType?: string | undefined;
  credentialBackedUp: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AuthAccountConnectedChannel {
  type: string;
  label: string;
  verifiedAt: number;
}

export interface AuthAccountSessionSummary {
  id: string;
  current: boolean;
  createdAt: number;
  expiresAt: number;
}

export interface AuthAccountPluginSettingsField {
  name: string;
  label: string;
  control: "text" | "url" | "number" | "checkbox";
  secret: boolean;
  required: boolean;
  value?: string | number | boolean | null | undefined;
  set?: boolean | undefined;
}

export interface AuthAccountPluginSettingsForm {
  id: string;
  title: string;
  description?: string | undefined;
  configured: boolean;
  revision: number | null;
  fields: readonly AuthAccountPluginSettingsField[];
}

export type AuthAccountPluginSettingsMutation =
  | {
      action: "save";
      definitionId: string;
      values: Record<string, unknown>;
    }
  | {
      action: "delete";
      definitionId: string;
    };

export interface AuthAccountSnapshot {
  displayName: string;
  role: AuthAccountRole;
  /**
   * Present when the caller is the configured personal Anchor with a
   * Studio-owned profile: the profile owns the display name, so it is not
   * self-editable in the Studio Account view.
   */
  profileEntityId?: string | undefined;
  passkeys: AuthAccountPasskey[];
  /** Not revoked, newest first; an expired one stays listed until revoked. */
  appPasswords: AuthAccountAppPassword[];
  connectedChannels: AuthAccountConnectedChannel[];
  pluginSettings: readonly AuthAccountPluginSettingsForm[];
  sessions: AuthAccountSessionSummary[];
}
