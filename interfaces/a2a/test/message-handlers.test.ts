import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { A2AInterface } from "../src/a2a-interface";

function mockA2AFetch(): ReturnType<typeof mock> {
  return mock(async (input: string | URL | Request): Promise<Response> => {
    const url = String(input);
    if (url.endsWith("/.well-known/agent-card.json")) {
      const origin = url.replace("/.well-known/agent-card.json", "");
      return new Response(
        JSON.stringify({ name: "Remote", url: `${origin}/a2a` }),
      );
    }
    return new Response(
      `data: ${JSON.stringify({
        result: {
          final: true,
          status: {
            state: "completed",
            message: { parts: [{ kind: "text", text: "Agent answer" }] },
          },
        },
      })}\n\n`,
      { headers: { "Content-Type": "text/event-stream" } },
    );
  });
}

describe("A2A call message handlers", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let fetchFn: ReturnType<typeof mockA2AFetch>;

  beforeEach(async () => {
    harness = createPluginHarness();
    harness.addEntities([
      {
        id: "approved.example",
        entityType: "agent",
        content: "Approved",
        metadata: { name: "Approved Agent", status: "approved" },
      },
      {
        id: "discovered.example",
        entityType: "agent",
        content: "Discovered",
        metadata: { name: "Discovered Agent", status: "discovered" },
      },
      {
        id: "archived.example",
        entityType: "agent",
        content: "Archived",
        metadata: { name: "Archived Agent", status: "archived" },
      },
    ]);
    fetchFn = mockA2AFetch();
    // The handlers get their fetch from the interface's deps, so the fake goes
    // in there rather than over the global.
    await harness.installPlugin(new A2AInterface({}, { fetch: fetchFn }));
  });

  afterEach(async () => {
    await harness.getMockShell().getDaemonRegistry().stopPlugin("a2a");
  });

  it("lists only approved directory agents", async () => {
    const response = await harness.getMockShell().getMessageBus().send({
      type: "a2a:call:agents",
      payload: {},
      sender: "studio",
    });

    expect(response).toEqual({
      success: true,
      data: {
        agents: [{ id: "approved.example", label: "Approved Agent" }],
      },
    });
  });

  it("answers through the same result shape as agent_call", async () => {
    const response = await harness
      .getMockShell()
      .getMessageBus()
      .send({
        type: "a2a:call:request",
        payload: {
          agent: "approved.example",
          instruction: "Is this accurate?",
          selection: "Selected markdown",
        },
        sender: "studio",
      });
    const tool = harness
      .getCapabilities()
      .tools.find((candidate) => candidate.name === "agent_call");
    if (!tool) throw new Error("Expected agent_call tool");
    const toolResult = await tool.handler(
      { agent: "approved.example", message: "Compare shape" },
      {
        interfaceType: "test",
        actor: { kind: "user", userId: "test" },
      },
    );

    expect("success" in response && response.success).toBe(true);
    expect(response).toHaveProperty("data.response", "Agent answer");
    expect(response).toHaveProperty("data.state", "completed");
    expect(toolResult).toHaveProperty("data.response", "Agent answer");
    expect(toolResult).toHaveProperty("data.state", "completed");
  });

  it("refuses unapproved and archived agents before network contact", async () => {
    for (const agent of ["discovered.example", "archived.example"]) {
      const response = await harness
        .getMockShell()
        .getMessageBus()
        .send({
          type: "a2a:call:request",
          payload: { agent, instruction: "Review", selection: "Text" },
          sender: "studio",
        });
      expect("success" in response && response.success).toBe(false);
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("refuses unknown agents instead of making a one-shot call", async () => {
    const response = await harness
      .getMockShell()
      .getMessageBus()
      .send({
        type: "a2a:call:request",
        payload: {
          agent: "unknown.example",
          instruction: "Review",
          selection: "Text",
        },
        sender: "studio",
      });

    expect("success" in response && response.success).toBe(false);
    expect(response).toHaveProperty("error", expect.stringContaining("saved"));
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("A2A network ask channel", () => {
  const sources = [
    {
      id: "post:a-piece",
      title: "A piece",
      source: "post",
      url: "https://approved.example/posts/a-piece",
    },
  ];

  function citingFetch(): ReturnType<typeof mock> {
    return mock(async (input: string | URL | Request): Promise<Response> => {
      const url = String(input);
      if (url.endsWith("/.well-known/agent-card.json")) {
        const origin = url.replace("/.well-known/agent-card.json", "");
        return new Response(
          JSON.stringify({ name: "Remote", url: `${origin}/a2a` }),
        );
      }
      const events = [
        {
          result: {
            kind: "artifact-update",
            taskId: "t",
            artifact: {
              artifactId: "a",
              name: "sources",
              parts: [{ kind: "data", data: { sources } }],
            },
          },
        },
        {
          result: {
            kind: "status-update",
            final: true,
            status: {
              state: "completed",
              message: { parts: [{ kind: "text", text: "Cited answer" }] },
            },
          },
        },
      ];
      return new Response(
        events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
        { headers: { "Content-Type": "text/event-stream" } },
      );
    });
  }

  /** A peer that never answers: the request settles only when it is aborted. */
  function hangingFetch(): ReturnType<typeof mock> {
    return mock(
      (_input: string | URL | Request, init?: RequestInit): Promise<Response> =>
        new Promise((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) return;
          if (signal.aborted) reject(signal.reason);
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        }),
    );
  }

  async function installed(
    fetchFn: ReturnType<typeof mock>,
    config: ConstructorParameters<typeof A2AInterface>[0] = {},
  ): Promise<ReturnType<typeof createPluginHarness>> {
    const harness = createPluginHarness();
    harness.addEntities([
      {
        id: "approved.example",
        entityType: "agent",
        content: "Approved",
        metadata: { name: "Approved Agent", status: "approved" },
      },
      {
        id: "discovered.example",
        entityType: "agent",
        content: "Discovered",
        metadata: { name: "Discovered Agent", status: "discovered" },
      },
    ]);
    await harness.installPlugin(new A2AInterface(config, { fetch: fetchFn }));
    return harness;
  }

  type Bus = ReturnType<
    ReturnType<
      ReturnType<typeof createPluginHarness>["getMockShell"]
    >["getMessageBus"]
  >;
  const ask = (
    harness: ReturnType<typeof createPluginHarness>,
    agent: string,
  ): ReturnType<Bus["send"]> =>
    harness
      .getMockShell()
      .getMessageBus()
      .send({
        type: "a2a:ask:request",
        payload: { agent, question: "What do you know about gardens?" },
        sender: "agent",
      });

  it("returns the peer's answer with its sources", async () => {
    const fetchFn = citingFetch();
    const harness = await installed(fetchFn);
    try {
      const response = await ask(harness, "approved.example");
      expect(response).toEqual({
        success: true,
        data: { state: "completed", response: "Cited answer", sources },
      });
      const sent = fetchFn.mock.calls.find(
        (call) => call[1] !== undefined && call[1].method === "POST",
      );
      const body = String(sent?.[1]?.body);
      expect(body).toContain("What do you know about gardens?");
      expect(body).toContain("Answer briefly, from your own public content");
    } finally {
      await harness.getMockShell().getDaemonRegistry().stopPlugin("a2a");
    }
  });

  it("treats a peer's refusal as no answer", async () => {
    const fetchFn = mock(
      async (input: string | URL | Request): Promise<Response> => {
        const url = String(input);
        if (url.endsWith("/.well-known/agent-card.json")) {
          const origin = url.replace("/.well-known/agent-card.json", "");
          return new Response(
            JSON.stringify({ name: "Remote", url: `${origin}/a2a` }),
          );
        }
        return new Response(
          `data: ${JSON.stringify({
            result: {
              kind: "status-update",
              final: true,
              status: {
                state: "failed",
                message: {
                  parts: [{ kind: "text", text: "Over for today." }],
                },
              },
            },
          })}\n\n`,
          { headers: { "Content-Type": "text/event-stream" } },
        );
      },
    );
    const harness = await installed(fetchFn);
    try {
      expect(await ask(harness, "approved.example")).toEqual({
        success: false,
        error: "approved.example did not answer: Over for today.",
      });
    } finally {
      await harness.getMockShell().getDaemonRegistry().stopPlugin("a2a");
    }
  });

  it("refuses peers that are not saved and approved", async () => {
    const fetchFn = citingFetch();
    const harness = await installed(fetchFn);
    try {
      for (const agent of ["discovered.example", "unknown.example"]) {
        const response = await ask(harness, agent);
        expect("success" in response && response.success).toBe(false);
      }
      expect(fetchFn).not.toHaveBeenCalled();
    } finally {
      await harness.getMockShell().getDaemonRegistry().stopPlugin("a2a");
    }
  });

  it("gives up on a peer that does not answer within the ask budget", async () => {
    const fetchFn = hangingFetch();
    const harness = await installed(fetchFn, { networkAskTimeoutMs: 20 });
    try {
      const response = await ask(harness, "approved.example");
      expect(response).toEqual({
        success: false,
        error: "approved.example did not answer within 20 ms",
      });
    } finally {
      await harness.getMockShell().getDaemonRegistry().stopPlugin("a2a");
    }
  });
});
