import { z } from "@brains/utils/zod";

/** Public presentation hints, never authorization, admission or live readiness. */
export interface InterfaceAvailability {
  readonly public: boolean;
  readonly preview: boolean;
}
export interface InterfaceAvailabilityOwner {
  readonly packageName: string;
  readonly declarationId: string;
}
export interface InterfaceAvailabilityWriter {
  /** Replaces this interface's own public hints; cannot target another owner. */
  set(value: InterfaceAvailability): Promise<void>;
}
export interface InterfaceAvailabilityReader {
  /** Missing, malformed or unreadable hints fail closed to null. */
  get(owner: InterfaceAvailabilityOwner): Promise<InterfaceAvailability | null>;
}
export const interfaceAvailabilitySchema: z.ZodObject<{
  public: z.ZodBoolean;
  preview: z.ZodBoolean;
}> = z.strictObject({ public: z.boolean(), preview: z.boolean() });
