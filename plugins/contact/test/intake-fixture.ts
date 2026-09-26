import { createPluginHarness } from "@brains/plugins/test";
import { instantiate, contactEntities } from "./helpers";
import {
  ContactAdmission,
  ContactIntake,
  type ContactAdmissionPolicy,
} from "../src";

export const start: number = Date.parse("2026-09-21T10:00:00.000Z");
export const peer: string = "192.0.2.1";
export const input: { name: string; email: string; message: string } = {
  name: "Ada",
  email: "private@example.com",
  message: "A private message",
};
export const admissionPolicy: ContactAdmissionPolicy = {
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
  intake: ContactIntake;
  admission: ContactAdmission;
  queued: Set<string>;
  now: () => number;
  advance: (milliseconds: number) => void;
  failEnqueue: (value: boolean) => void;
  token: () => Promise<string>;
}

export async function intakeFixture(
  options: { maxRecords?: number; maxBytes?: number } = {},
): Promise<IntakeFixture> {
  let now = start;
  let enqueueFails = false;
  const queued = new Set<string>();
  const harness = createPluginHarness();
  await harness.installPlugin(instantiate().entity);
  const state = harness.getMockShell().getRuntimeState();
  const admission = new ContactAdmission(state, admissionPolicy, () => now);
  const intake = new ContactIntake({
    admission,
    entities: contactEntities(harness.getEntityService()),
    state,
    policy: {
      retentionSeconds: 86400,
      maxRecords: options.maxRecords ?? 10,
      maxBytes: options.maxBytes ?? 100000,
    },
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
