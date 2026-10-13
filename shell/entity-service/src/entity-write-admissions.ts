import { jsonValueSchema, type JsonValue } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import type { BaseEntity } from "./types";

const nameSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z][a-z0-9.-]*:[a-z][a-z0-9.-]*$/u);

export interface EntityWriteAdmission {
  name: string;
  payload: JsonValue;
}
/** Data only. Guard implementations and schema authority stay with the owner. */
export const entityWriteAdmissionSchema: z.ZodType<
  EntityWriteAdmission,
  unknown
> = z
  .strictObject({
    name: nameSchema,
    payload: jsonValueSchema,
  })
  .refine(
    (value) =>
      new TextEncoder().encode(JSON.stringify(value)).byteLength <= 16 * 1024,
    {
      message: "Write admission exceeds its 16 KiB metadata allowance",
    },
  );
export interface EntityWriteAdmissionContext {
  entity: Readonly<BaseEntity>;
  operation: "create" | "update";
  signal?: AbortSignal | undefined;
}
type BeforeWrite = (entity: Readonly<BaseEntity>) => Promise<void>;
interface AdmissionOptions {
  writeAdmission?: EntityWriteAdmission | undefined;
  beforeWrite?: BeforeWrite | undefined;
  signal?: AbortSignal | undefined;
}
interface Registration {
  prepare(
    payload: unknown,
  ): (context: EntityWriteAdmissionContext) => Promise<void>;
}

/** Owner-local guards run at the final, serialized-entity write boundary.
 * They may consult other stores, but must not re-enter this entity database's
 * root client while its transaction is held. Dispose registrations on teardown.
 */
export class EntityWriteAdmissions {
  private readonly registrations = new Map<string, Registration>();

  public register<T>(
    name: string,
    schema: z.ZodType<T>,
    authorize: (
      context: EntityWriteAdmissionContext,
      payload: T,
    ) => Promise<void>,
  ): () => void {
    nameSchema.parse(name);
    if (this.registrations.has(name))
      throw new Error("Write admission is already registered");
    const registration: Registration = {
      prepare: (payload) => {
        const parsed = schema.parse(payload);
        return (context): Promise<void> => authorize(context, parsed);
      },
    };
    this.registrations.set(name, registration);
    return (): void => {
      if (this.registrations.get(name) === registration)
        this.registrations.delete(name);
    };
  }

  /** Resolve and validate before taking the writer; authorize only inside it.
   * Local callbacks remain local and cannot be combined with a named guard.
   */
  public prepare(
    options: AdmissionOptions | undefined,
    operation: EntityWriteAdmissionContext["operation"],
  ): BeforeWrite | undefined {
    if (options?.writeAdmission === undefined) return options?.beforeWrite;
    if (options.beforeWrite)
      throw new Error("Cannot combine a write admission with beforeWrite");
    const reference = entityWriteAdmissionSchema.parse(options.writeAdmission);
    const registration = this.registrations.get(reference.name);
    if (!registration) throw new Error("Unknown write admission");
    const authorize = registration.prepare(reference.payload);
    const signal = options.signal;
    const assertRegistered = (): void => {
      if (this.registrations.get(reference.name) !== registration)
        throw new Error("Write admission was removed");
    };
    return async (entity): Promise<void> => {
      signal?.throwIfAborted();
      assertRegistered();
      await authorize({ entity, operation, signal });
      assertRegistered();
      signal?.throwIfAborted();
    };
  }
}
