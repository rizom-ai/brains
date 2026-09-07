// Hermetic provider boundary only; the packed runtime, queue, and entities are real.
// Unexpected network access fails instead of contacting an external service.
globalThis.fetch = Object.assign(
  async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);
    if (url !== "https://api.openai.com/v1/responses")
      throw new Error(`Unexpected provider request: ${url}`);
    const body =
      input instanceof Request ? await input.text() : String(init?.body);
    const value = body.includes('"wordCount"')
      ? {
          bookmarkId: "durable-services",
          summary: "Generated reading digest",
          wordCount: 3,
        }
      : { title: "Generated overview", body: "Independent bookmark output" };
    return Response.json({
      id: "resp_fixture",
      object: "response",
      created_at: 1,
      model: "gpt-5.6-luna",
      status: "completed",
      output: [
        {
          id: "msg_fixture",
          type: "message",
          role: "assistant",
          status: "completed",
          content: [
            {
              type: "output_text",
              text: JSON.stringify(value),
              annotations: [],
            },
          ],
        },
      ],
      usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
    });
  },
  { preconnect: globalThis.fetch.preconnect },
);
