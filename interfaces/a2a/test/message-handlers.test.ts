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
  const originalFetch = globalThis.fetch;

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
    globalThis.fetch = Object.assign(fetchFn, {
      preconnect: originalFetch.preconnect,
    });
    await harness.installPlugin(new A2AInterface());
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    await harness.getMockShell().getDaemonRegistry().stopPlugin("a2a");
  });

  it("lists only approved directory agents", async () => {
    const response = await harness.getMockShell().getMessageBus().send({
      type: "a2a:call:agents",
      payload: {},
      sender: "cms",
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
        sender: "cms",
      });
    const tool = harness
      .getCapabilities()
      .tools.find((candidate) => candidate.name === "agent_call");
    if (!tool) throw new Error("Expected agent_call tool");
    const toolResult = await tool.handler(
      { agent: "approved.example", message: "Compare shape" },
      { interfaceType: "test", userId: "test" },
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
          sender: "cms",
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
        sender: "cms",
      });

    expect("success" in response && response.success).toBe(false);
    expect(response).toHaveProperty("error", expect.stringContaining("saved"));
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
