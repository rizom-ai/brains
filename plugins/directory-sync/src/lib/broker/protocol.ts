/** Atomic wire-version change: both endpoints speak only Effect RPC v2. */
export const BROKER_PROTOCOL_VERSION = 2;
export const MAX_FRAME_BYTES: number = 8 * 1024 * 1024;
export const MAX_PAYLOAD_BYTES: number = 4 * 1024 * 1024;

export type ProtocolErrorCode =
  "frame-too-large" | "malformed" | "version-mismatch";

export class ProtocolError extends Error {
  readonly code: ProtocolErrorCode;
  constructor(code: ProtocolErrorCode, message: string) {
    super(message);
    this.name = "ProtocolError";
    this.code = code;
  }
}

/** Promise-facade status; no Effect or RPC types escape the wire boundary. */
export interface StatusMessage {
  type: "status";
  version: number;
  requestId: string;
  brokerId: string;
  checkouts: string[];
  activeRequestIds: string[];
  queuedRequestIds: string[];
  ambiguousRequestIds: string[];
  evidenceComplete: boolean;
  recoveryPending: boolean;
  admitsMutations: boolean;
  oldestActiveProgressAt: number | null;
}
