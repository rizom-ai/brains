/** Browser-safe, session-derived own-account contracts. */
export const AUTH_ACCOUNT_MUTATION_ACTIONS = {
  updateDisplayName: "updateDisplayName",
  revokePasskey: "revokePasskey",
  revokeSession: "revokeSession",
  revokeOtherSessions: "revokeOtherSessions",
  revokeAllSessions: "revokeAllSessions",
} as const;

export type AuthAccountRole = "admin" | "trusted" | "public";
export type AuthAccountMutationAction =
  (typeof AUTH_ACCOUNT_MUTATION_ACTIONS)[keyof typeof AUTH_ACCOUNT_MUTATION_ACTIONS];

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
    };

export interface AuthAccountPasskey {
  id: string;
  transports?: string[];
  credentialDeviceType?: string;
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

export interface AuthAccountSnapshot {
  displayName: string;
  role: AuthAccountRole;
  passkeys: AuthAccountPasskey[];
  connectedChannels: AuthAccountConnectedChannel[];
  sessions: AuthAccountSessionSummary[];
}

export interface AuthAccountResponse {
  account: AuthAccountSnapshot;
}
