import type { AgentPersonClaimInput } from "@brains/auth-service/admin-contracts";

export interface AgentPromotionDraft {
  agentId: string;
  displayName?: string;
  claims?: AgentPersonClaimInput[];
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
  | { kind: "add" }
  | { kind: "identity" }
  | { kind: "promotion"; draft: AgentPromotionDraft }
  | { kind: "setup"; setupUrl: string; copy: string }
  | Confirmation
  | null;

export type SurfaceView = "roster" | "representations";
