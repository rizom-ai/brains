export interface ExternalPeerInvitationDraft {
  peerId: string;
  displayName?: string;
}

export interface Confirmation {
  kind: "confirm";
  title: string;
  copy: string;
  warning: string;
  submitLabel: string;
  run: () => Promise<void>;
}

export type Modal =
  | { kind: "add"; draft?: ExternalPeerInvitationDraft }
  | { kind: "setup"; setupUrl: string; copy: string }
  | Confirmation
  | null;

export type SurfaceView = "overview" | "members" | "invitations" | "audit";
