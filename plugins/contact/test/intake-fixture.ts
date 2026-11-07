import { createPluginHarness } from "@brains/plugins/test";
import {
  FormAdmission,
  FormHttpHandlers,
  FormIntake,
  formDefinitionSchema,
  type FormAdmissionPolicy,
  type FormDefinition,
  type FormHttpOptions,
  type FormHttpPolicy,
} from "@brains/forms";
import {
  CONTACT_ADMISSION,
  CONTACT_FORM,
  CONTACT_SLOTS,
  ContactRequestPlugin,
  contactRequestTarget,
} from "../src";

/** The contact form as the engine runs it. */
export const contactDefinition: FormDefinition = formDefinitionSchema.parse(
  CONTACT_FORM.definition,
);
/** The contact form's HTTP boundary, in contact's own words. */
export function contactHandlers(
  admission: FormAdmission,
  intake: FormIntake,
  policy: FormHttpPolicy,
  options: FormHttpOptions = {},
): FormHttpHandlers {
  return new FormHttpHandlers(contactDefinition, admission, intake, policy, {
    copy: CONTACT_FORM.copy,
    prefill: CONTACT_FORM.prefill,
    ...options,
  });
}

export const start: number = Date.parse("2026-09-21T10:00:00.000Z");
export const peer: string = "192.0.2.1";
export const input: { name: string; email: string; message: string } = {
  name: "Ada",
  email: "private@example.com",
  message: "A private message",
};
export const admissionPolicy: FormAdmissionPolicy = {
  windowSeconds: 60,
  globalRequests: 100,
  networkRequests: 50,
  globalForms: 10,
  networkForms: 5,
  globalSubmissions: 8,
  networkSubmissions: 4,
  tokenTtlSeconds: 30,
  receiptTtlSeconds: 120,
  maxEntries: 20,
};

export interface IntakeFixture {
  harness: ReturnType<typeof createPluginHarness>;
  intake: FormIntake;
  admission: FormAdmission;
  queued: Set<string>;
  now: () => number;
  advance: (milliseconds: number) => void;
  failEnqueue: (value: boolean) => void;
  token: () => Promise<string>;
}

export async function intakeFixture(
  options: { maxInFlight?: number } = {},
): Promise<IntakeFixture> {
  let now = start;
  let enqueueFails = false;
  const queued = new Set<string>();
  const harness = createPluginHarness();
  await harness.installPlugin(new ContactRequestPlugin());
  const state = harness.getMockShell().getRuntimeState();
  const admission = new FormAdmission(
    state,
    admissionPolicy,
    CONTACT_ADMISSION,
    () => now,
  );
  const intake = new FormIntake({
    form: contactDefinition,
    target: contactRequestTarget,
    admission,
    entities: harness.getEntityService(),
    state,
    slots: { ...CONTACT_SLOTS, maxInFlight: options.maxInFlight },
    enqueueNotification: async (id): Promise<void> => {
      if (enqueueFails) throw new Error("PRIVATE delivery failure");
      queued.add(id);
    },
    now: (): number => now,
  });
  return {
    harness,
    admission,
    intake,
    queued,
    now: (): number => now,
    advance: (milliseconds): void => {
      now += milliseconds;
    },
    failEnqueue: (value): void => {
      enqueueFails = value;
    },
    token: async (): Promise<string> => {
      const form = await admission.issue(peer);
      if (form.kind !== "issued") throw new Error("Form unavailable");
      return form.token;
    },
  };
}
