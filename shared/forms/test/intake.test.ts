import { describe, expect, it } from "bun:test";
import { baseEntitySchema } from "@brains/plugins";
import {
  createPluginHarness,
  createTestEntityAdapter,
} from "@brains/plugins/test";
import {
  FormAdmission,
  FormIntake,
  FormStorageSlots,
  formDefinitionSchema,
} from "../src";
import { noteTarget } from "./fake-target";

const peer = "192.0.2.1";
const signal = new AbortController().signal;
const policy = {
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

describe("a form that sends no alert", () => {
  it("saves each submission with nothing left in flight and nothing queued", async () => {
    const harness = createPluginHarness();
    harness
      .getEntityRegistry()
      .registerEntityType(
        "note-request",
        baseEntitySchema.partial().passthrough(),
        createTestEntityAdapter("note-request"),
      );
    const state = harness.getMockShell().getRuntimeState();
    const form = formDefinitionSchema.parse({
      id: "quiet",
      target: "note-request",
      title: "Quiet",
      steps: [{ fields: [{ kind: "text", id: "name", label: "Name" }] }],
      notify: { enabled: false },
    });
    const options = { namespace: "forms.quiet.admission", idPrefix: "quiet" };
    const admission = new FormAdmission(state, policy, options);
    const queued: string[] = [];
    const slots = { namespace: "forms.quiet.storage", idPrefix: "quiet" };
    const intake = new FormIntake({
      form,
      target: noteTarget,
      admission,
      entities: harness.getEntityService(),
      state,
      slots,
      enqueueNotification: async (id): Promise<void> => {
        queued.push(id);
      },
    });
    const issued = await admission.issue(peer);
    if (issued.kind !== "issued") throw new Error("No form");
    const saved = await intake.submit(
      issued.token,
      { name: "Ada" },
      peer,
      signal,
    );
    expect(saved.kind).toBe("saved");
    expect(queued).toEqual([]);
    expect(await new FormStorageSlots(state, slots, Date.now).list()).toEqual(
      [],
    );
    expect(await intake.maintain(signal)).toMatchObject({
      pendingNotifications: 0,
    });
  });
});
