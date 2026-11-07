import { describe, expect, it } from "bun:test";
import { baseEntitySchema } from "@brains/plugins";
import {
  createPluginHarness,
  createTestEntityAdapter,
} from "@brains/plugins/test";
import {
  FormAdmission,
  FormHttpHandlers,
  FormIntake,
  FormReceipts,
  formDefinitionSchema,
} from "../src";
import { noteTarget } from "./fake-target";

const origin = "https://brain.test";
const peer = "192.0.2.1";
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
const quiz = formDefinitionSchema.parse({
  id: "quiz",
  target: "note-request",
  path: "/quiz",
  title: "Quiz",
  thanks: { title: "Your result" },
  notify: { enabled: false },
  steps: [
    {
      fields: [
        {
          kind: "choice",
          id: "q1",
          label: "First",
          required: true,
          options: [
            {
              value: "a",
              label: "A",
              scores: [{ dimension: "identity", outcome: "seeking" }],
            },
            {
              value: "b",
              label: "B",
              scores: [{ dimension: "identity", outcome: "play" }],
            },
          ],
        },
        {
          kind: "choices",
          id: "q2",
          label: "Second",
          options: [
            {
              value: "a",
              label: "A",
              scores: [{ dimension: "audience", outcome: "care" }],
            },
            { value: "b", label: "B" },
          ],
        },
      ],
    },
  ],
  scoring: {
    dimensions: [
      {
        id: "identity",
        title: "Identity",
        outcomes: [
          { id: "seeking", title: "Seeking" },
          { id: "play", title: "Play" },
        ],
      },
      {
        id: "audience",
        title: "Audience",
        outcomes: [{ id: "care", title: "Care" }],
      },
    ],
  },
});

async function handlers(): Promise<FormHttpHandlers> {
  const harness = createPluginHarness();
  harness
    .getEntityRegistry()
    .registerEntityType(
      "note-request",
      baseEntitySchema.partial().passthrough(),
      createTestEntityAdapter("note-request"),
    );
  const state = harness.getMockShell().getRuntimeState();
  const admission = new FormAdmission(state, policy, {
    namespace: "forms.quiz.admission",
    idPrefix: "quiz",
  });
  const intake = new FormIntake({
    form: quiz,
    target: noteTarget,
    admission,
    entities: harness.getEntityService(),
    state,
    slots: { namespace: "forms.quiz.storage", idPrefix: "quiz" },
    enqueueNotification: async (): Promise<void> => {},
  });
  return new FormHttpHandlers(
    quiz,
    admission,
    intake,
    { origin, maxBodyBytes: 20000, readTimeoutMs: 10000 },
    { receipts: new FormReceipts(state, "forms.quiz.receipts", 120) },
  );
}

describe("a scored form over HTTP", () => {
  it("sends the visitor from the post to their results through an opaque receipt", async () => {
    const http = await handlers();
    const page = await http.handle(new Request(`${origin}/quiz`), {
      remoteAddress: peer,
    });
    const token = (await page.text()).match(
      /name="token" value="([a-f0-9]+)"/,
    )?.[1];
    if (!token) throw new Error("Missing token");
    const body = new URLSearchParams([
      ["token", token],
      ["q1", "b"],
      ["q2", "a"],
      ["q2", "b"],
    ]);
    const sent = await http.handle(
      new Request(`${origin}/quiz`, {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/x-www-form-urlencoded",
        },
        body,
      }),
      { remoteAddress: peer },
    );
    expect(sent.status).toBe(303);
    const location = sent.headers.get("location") ?? "";
    expect(location).toMatch(/^\/quiz\/thanks\?receipt=[a-f0-9]{64}$/);
    const thanks = await (
      await http.handle(new Request(`${origin}${location}`), {
        remoteAddress: peer,
      })
    ).text();
    expect(thanks).toContain('data-dimension="identity" data-outcome="play"');
    expect(thanks).toContain('data-dimension="audience" data-outcome="care"');
    // Without the receipt the page thanks, and shows no one's results.
    const bare = await (
      await http.handle(new Request(`${origin}/quiz/thanks`), {
        remoteAddress: peer,
      })
    ).text();
    expect(bare).toContain("<h1>Your result</h1>");
    expect(bare).not.toContain('class="form__outcome"');
  });
});
