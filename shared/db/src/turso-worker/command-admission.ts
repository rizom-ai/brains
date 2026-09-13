import { z } from "@brains/utils/zod";

export const MAX_COMMANDS: number = 16;
export const MAX_QUEUED_COMMAND_BYTES: number = 256 * 1024;
export type CommandLane = "ordinary" | "control" | "cleanup" | "close";
export interface CommandAdmissionOptions {
  role: "sender" | "receiver";
  maxInFlight?: number | undefined;
  maxPendingBytes?: number | undefined;
}
const optionsSchema: z.ZodType<CommandAdmissionOptions> = z.strictObject({
  role: z.enum(["sender", "receiver"]),
  maxInFlight: z.number().int().min(1).max(MAX_COMMANDS).optional(),
  maxPendingBytes: z
    .number()
    .int()
    .min(256)
    .max(MAX_QUEUED_COMMAND_BYTES)
    .optional(),
});
export interface CommandAdmissionStats {
  ordinary: number;
  controls: number;
  cleanupRequests: number;
  pendingBytes: number;
}

/** Queue metadata only, never resident/native/transport memory accounting.
 * Sender reserves two controls plus its one protocol-owned close; receiver admits
 * three controls. The caller must enforce one-shot close and command identities.
 */
export class CommandAdmission {
  private readonly role: CommandAdmissionOptions["role"];
  private readonly maxInFlight: number;
  private readonly maxPendingBytes: number;
  private ordinary = 0;
  private controls = 0;
  private cleanupRequests = 0;
  private pendingBytes = 0;
  public constructor(input: CommandAdmissionOptions) {
    const parsed = optionsSchema.safeParse(input);
    if (!parsed.success)
      throw new Error("Invalid proof driver admission limits", {
        cause: parsed.error,
      });
    this.role = parsed.data.role;
    this.maxInFlight = parsed.data.maxInFlight ?? MAX_COMMANDS;
    this.maxPendingBytes =
      parsed.data.maxPendingBytes ?? MAX_QUEUED_COMMAND_BYTES;
  }
  public stats(): CommandAdmissionStats {
    return {
      ordinary: this.ordinary,
      controls: this.controls,
      cleanupRequests: this.cleanupRequests,
      pendingBytes: this.pendingBytes,
    };
  }
  public reserve(lane: CommandLane, bytes: number): () => void {
    if (!Number.isSafeInteger(bytes) || bytes < 0)
      throw new Error("Invalid command admission byte count");
    const cleanup = lane === "cleanup";
    const control = lane === "control" || lane === "close";
    if (
      cleanup
        ? this.cleanupRequests >= 2
        : control
          ? this.role === "sender"
            ? lane !== "close" && this.controls >= 2
            : this.controls >= 3
          : this.ordinary >= this.maxInFlight ||
            this.pendingBytes + bytes > this.maxPendingBytes
    )
      throw new Error("Proof driver overloaded");
    if (cleanup) this.cleanupRequests++;
    else if (control) this.controls++;
    else {
      this.ordinary++;
      this.pendingBytes += bytes;
    }
    let released = false;
    return () => {
      if (released) throw new Error("Command admission already released");
      released = true;
      if (cleanup) this.cleanupRequests--;
      else if (control) this.controls--;
      else {
        this.ordinary--;
        this.pendingBytes -= bytes;
      }
    };
  }
}
