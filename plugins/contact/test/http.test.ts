import { describe, expect, it, jest } from "bun:test";
import { ContactHttpHandlers } from "../src";
import { intakeFixture, input, peer } from "./intake-fixture";

const origin = "https://brain.test";
function post(
  body: string | ReadableStream<Uint8Array>,
  headers: Record<string, string> = {},
): Request {
  return new Request(`${origin}/contact`, {
    method: "POST",
    body,
    headers: {
      origin,
      "content-type": "application/x-www-form-urlencoded",
      ...headers,
    },
  });
}
function form(token: string, values = input): string {
  return new URLSearchParams({ token, ...values, website: "" }).toString();
}
async function fixture(maxBodyBytes = 65536): Promise<{
  handlers: ContactHttpHandlers;
  f: Awaited<ReturnType<typeof intakeFixture>>;
}> {
  const f = await intakeFixture();
  return {
    f,
    handlers: new ContactHttpHandlers(f.admission, f.intake, {
      origin,
      maxBodyBytes,
      readTimeoutMs: 10000,
    }),
  };
}

describe("contact HTTP boundary", () => {
  it("supports a no-JavaScript form, token, POST and local confirmation redirect", async () => {
    const { handlers, f } = await fixture();
    const page = await handlers.handle(new Request(`${origin}/contact`), {
      remoteAddress: peer,
    });
    expect(page.status).toBe(200);
    expect(page.headers.get("cache-control")).toBe("no-store");
    expect(page.headers.get("content-security-policy")).toContain(
      "form-action 'self'",
    );
    const html = await page.text();
    expect(html).toContain('method="post"');
    expect(html).not.toContain("<script");
    const token = /name="token" value="([a-f0-9]{64})"/.exec(html)?.[1];
    if (!token) throw new Error("Missing form token");
    const response = await handlers.handle(post(form(token)), {
      remoteAddress: peer,
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/contact/thanks");
    expect(f.queued.size).toBe(1);
    expect(
      (await handlers.handle(post(form(token)), { remoteAddress: peer }))
        .status,
    ).toBe(303);
    expect(f.queued.size).toBe(1);
    const confirmation = await handlers.handle(
      new Request(`${origin}/contact/thanks`),
      { remoteAddress: peer },
    );
    expect(await confirmation.text()).toContain("saved");
  });

  it("rejects foreign origins, methods, media types and missing socket identity before parsing", async () => {
    const { handlers } = await fixture();
    expect(
      (
        await handlers.handle(post("", { origin: "https://attacker.test" }), {
          remoteAddress: peer,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await handlers.handle(post("", { origin: "null" }), {
          remoteAddress: peer,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await handlers.handle(
          post("", { "content-type": "multipart/form-data; boundary=test" }),
          { remoteAddress: peer },
        )
      ).status,
    ).toBe(415);
    expect(
      (
        await handlers.handle(
          new Request(`${origin}/contact`, { method: "PUT" }),
          { remoteAddress: peer },
        )
      ).status,
    ).toBe(405);
    expect(
      (
        await handlers.handle(
          new Request(`${origin}/contact`, {
            headers: { "x-forwarded-for": peer },
          }),
          {},
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handlers.handle(new Request("https://foreign.test/contact"), {
          remoteAddress: peer,
        })
      ).status,
    ).toBe(403);
  });

  it("bounds streamed bodies independently of Content-Length", async () => {
    const { handlers } = await fixture(256);
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller): void {
        controller.enqueue(new Uint8Array(257).fill(97));
      },
      cancel(): void {
        cancelled = true;
      },
    });
    const result = await handlers.handle(
      post(body, { "content-length": "1" }),
      { remoteAddress: peer },
    );
    expect(result.status).toBe(413);
    expect(cancelled).toBe(true);
    expect(
      (
        await handlers.handle(post("", { "content-length": "257" }), {
          remoteAddress: peer,
        })
      ).status,
    ).toBe(413);
  });

  it("rejects duplicate or unexpected fields and escapes returned drafts", async () => {
    const { handlers, f } = await fixture();
    const token = await f.token();
    expect(
      (
        await handlers.handle(post(`${form(token)}&name=other`), {
          remoteAddress: peer,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await handlers.handle(post(`${form(token)}&visibility=public`), {
          remoteAddress: peer,
        })
      ).status,
    ).toBe(400);
    const response = await handlers.handle(
      post(
        form(token, {
          ...input,
          email: "invalid",
          message: "</textarea><script>alert(1)</script>",
        }),
      ),
      { remoteAddress: peer },
    );
    expect(response.status).toBe(400);
    const html = await response.text();
    expect(html).toContain("&lt;/textarea&gt;&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(f.queued.size).toBe(0);
  });

  it("rate-limits malformed posts and cookie resets before they can reach storage", async () => {
    const { handlers, f } = await fixture();
    let last = 0;
    for (let index = 0; index < 51; index++) {
      last = (
        await handlers.handle(
          post("invalid=true", {
            cookie: `guest=${index}`,
            "x-forwarded-for": `203.0.113.${index}`,
          }),
          { remoteAddress: peer },
        )
      ).status;
    }
    expect(last).toBe(429);
    expect(f.queued.size).toBe(0);
  });

  it("enforces the read deadline even when the visitor never aborts", async () => {
    jest.useFakeTimers();
    try {
      const { handlers, f } = await fixture();
      let started: (() => void) | undefined;
      const reading = new Promise<void>((resolve) => {
        started = resolve;
      });
      const body = new ReadableStream<Uint8Array>(
        {
          pull(): void {
            started?.();
          },
        },
        { highWaterMark: 0 },
      );
      const response = handlers.handle(post(body), { remoteAddress: peer });
      await reading;
      jest.advanceTimersByTime(10000);
      expect((await response).status).toBe(408);
      expect(f.queued.size).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it("cancels a stalled body read without saving anything", async () => {
    const { handlers, f } = await fixture();
    const abort = new AbortController();
    let cancel = false;
    let started: (() => void) | undefined;
    const reading = new Promise<void>((resolve) => {
      started = resolve;
    });
    const body = new ReadableStream<Uint8Array>(
      {
        pull(): void {
          started?.();
        },
        cancel(): void {
          cancel = true;
        },
      },
      { highWaterMark: 0 },
    );
    const request = new Request(`${origin}/contact`, {
      method: "POST",
      body,
      signal: abort.signal,
      headers: { origin, "content-type": "application/x-www-form-urlencoded" },
    });
    const response = handlers.handle(request, { remoteAddress: peer });
    await reading;
    abort.abort();
    expect((await response).status).toBe(408);
    expect(cancel).toBe(true);
    expect(f.queued.size).toBe(0);
  });
});
