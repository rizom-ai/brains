import { SdkError, SITE_BUILDER_CHANNELS, toSdkError } from "@brains/contracts";
import type { IMessageBus } from "@brains/messaging-service";
import { z } from "@brains/utils/zod";
import type {
  InstalledLayoutSlot,
  ServiceLayoutSlot,
} from "../service/site-slot-contract";
import type { IMessagingNamespace } from "../base/context-types";

const declarations = z.array(
  z.strictObject({
    slotName: z.string().min(1),
    priority: z.number().finite().optional(),
    render: z.custom<ServiceLayoutSlot["render"]>(
      (value) => typeof value === "function",
    ),
  }),
);
const requests = new WeakMap<
  object,
  {
    owner: string;
    credentials: Set<object>;
    providers: Set<string>;
  }
>();
const issued = new WeakMap<
  object,
  { request: object } & (
    { slots: readonly InstalledLayoutSlot[] } | { error: SdkError }
  )
>();

function issue(
  request: object,
  result: { slots: readonly InstalledLayoutSlot[] } | { error: SdkError },
): object {
  const credential = Object.freeze({});
  issued.set(credential, { request, ...result });
  requests.get(request)?.credentials.add(credential);
  return credential;
}

/** Only host registration issues response credentials. Payload owner claims are never used. */
export function registerSiteSlotProvider(
  messaging: Pick<IMessagingNamespace, "subscribeExecution">,
  owner: string,
  lifetime: AbortSignal,
  read: () => readonly ServiceLayoutSlot[],
): void {
  const active = (): void => {
    if (lifetime.aborted) throw new SdkError("cancelled");
  };
  messaging.subscribeExecution(
    SITE_BUILDER_CHANNELS.slots,
    async ({ payload, source }) => {
      try {
        active();
        if (
          typeof payload !== "object" ||
          payload === null ||
          requests.get(payload)?.owner !== source
        ) {
          throw new SdkError("permission_denied");
        }
        const collection = requests.get(payload);
        if (!collection || collection.providers.has(owner))
          throw new SdkError("permission_denied");
        collection.providers.add(owner);
        const values = declarations.safeParse(read());
        if (!values.success)
          throw new SdkError("invalid_response", { cause: values.error });
        const slots = values.data.map((entry): InstalledLayoutSlot => {
          const render = entry.render;
          return Object.freeze({
            ...entry,
            pluginId: owner,
            priority: entry.priority ?? 50,
            render: () => {
              active();
              try {
                const result = render();
                active();
                return result;
              } catch (cause) {
                throw toSdkError(cause);
              }
            },
          });
        });
        return {
          success: true,
          data: issue(payload, { slots: Object.freeze(slots) }),
        };
      } catch (cause) {
        const error = toSdkError(cause);
        const data =
          typeof payload === "object" &&
          payload !== null &&
          requests.get(payload)?.owner === source
            ? issue(payload, { error })
            : undefined;
        // The transport acknowledges a host-issued result, including a private
        // failure. Only the scoped reader unwraps it; bus failures drop data.
        return data
          ? { success: true, data }
          : { success: false, code: error.code, error: error.publicMessage };
      }
    },
  );
}

/** Fixed-topic reader; returned callbacks require both service and build lifetimes. */
export async function collectSiteSlots(
  bus: Pick<IMessageBus, "collect">,
  owner: string,
  lifetime: AbortSignal,
  signal: AbortSignal,
): Promise<readonly InstalledLayoutSlot[]> {
  const active = (): void => {
    if (lifetime.aborted || signal.aborted) throw new SdkError("cancelled");
  };
  const request = Object.freeze({});
  try {
    active();
    requests.set(request, {
      owner,
      credentials: new Set(),
      providers: new Set(),
    });
    const answers = await bus.collect({
      type: SITE_BUILDER_CHANNELS.slots,
      payload: request,
      sender: owner,
    });
    active();
    return Object.freeze(
      answers.flatMap((answer) => {
        const token = "data" in answer ? answer.data : undefined;
        const value =
          typeof token === "object" && token !== null
            ? issued.get(token)
            : undefined;
        if (value?.request === request && "error" in value) throw value.error;
        if (!("success" in answer) || !answer.success)
          throw toSdkError(answer, "handler_failed");
        if (value?.request !== request || !("slots" in value))
          throw new SdkError("invalid_response");
        return value.slots.map((entry) =>
          Object.freeze({
            ...entry,
            render: () => {
              active();
              const result = entry.render();
              active();
              return result;
            },
          }),
        );
      }),
    );
  } catch (cause) {
    active();
    throw toSdkError(cause);
  } finally {
    for (const credential of requests.get(request)?.credentials ?? [])
      issued.delete(credential);
    requests.delete(request);
  }
}
