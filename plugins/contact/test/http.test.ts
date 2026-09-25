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
    // Chrome sends Origin: null for native POST navigations under no-referrer.
    // Keep same-origin form POSTs identifiable without exposing cross-site referrers.
    expect(page.headers.get("referrer-policy")).toBe("same-origin");
    expect(page.headers.get("content-security-policy")).toContain(
      "form-action 'self'",
    );
    const html = await page.text();
    expect(html).toContain('method="post"');
    expect(html).toContain("kept for 1 day, then deleted.");
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

  it("starts the message with the topic the visitor chose on the site, escaped and bounded", async () => {
    const { handlers } = await fixture();
    const page = async (query: string): Promise<string> =>
      (
        await handlers.handle(new Request(`${origin}/contact${query}`), {
          remoteAddress: peer,
        })
      ).text();
    const topic = "Our AI tools don’t know what we know";
    expect(
      await page(`?${new URLSearchParams({ topic, theme: "light" })}`),
    ).toContain(
      `name="message" rows="5" maxlength="4000">${topic}\n\n</textarea>`,
    );
    const hostile = await page(
      `?${new URLSearchParams({ topic: "</textarea><script>alert(1)</script>" })}`,
    );
    expect(hostile).toContain("&lt;/textarea&gt;&lt;script&gt;");
    expect(hostile).not.toContain("<script>");
    expect(await page(`?topic=${"a".repeat(500)}`)).not.toContain(
      "a".repeat(201),
    );
    expect(await page("")).toContain('maxlength="4000"></textarea>');
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

async function page(
  handlers: ContactHttpHandlers,
  request: Request,
  remoteAddress = peer,
): Promise<{ status: number; token: string | undefined }> {
  const response = await handlers.handle(request, { remoteAddress });
  const token = /name="token" value="([a-f0-9]{64})"/.exec(
    await response.text(),
  )?.[1];
  return { status: response.status, token };
}

describe("contact page for visitors", () => {
  async function page(owner?: string, path = "/contact"): Promise<string> {
    const f = await intakeFixture();
    const handlers = new ContactHttpHandlers(
      f.admission,
      f.intake,
      { origin, maxBodyBytes: 65536, readTimeoutMs: 10000 },
      owner ? { owner: (): string => owner } : {},
    );
    const response = await handlers.handle(new Request(`${origin}${path}`), {
      remoteAddress: peer,
    });
    return response.text();
  }

  it("invites the visitor to write to the owner by name, in plain words", async () => {
    const html = await page("Yeehaa");
    expect(html).toContain("<h1>Write to Yeehaa</h1>");
    expect(html).toContain("goes privately to Yeehaa");
    expect(html).toContain(">Send note</button>");
    // What the visitor reads, not the theme's stylesheet.
    const shown = html.slice(html.indexOf("<main>"));
    for (const jargon of ["Brain", "intake", "Cleanup runs", "request"])
      expect(shown).not.toContain(jargon);
    const unnamed = await page();
    expect(unnamed).toContain("<h1>Write a note</h1>");
    expect(unnamed).toContain("goes privately to the owner of this site");
  });

  it("says on the form how long a note is kept and how deletion can lag", async () => {
    const html = await page("Yeehaa");
    expect(html).toContain("kept for 1 day, then deleted.");
    expect(html).toContain("Deletion can run late");
    expect(html).toContain("backups may keep earlier copies");
  });

  it("confirms a saved note without promising the alert arrived", async () => {
    const html = await page("Yeehaa", "/contact/thanks");
    expect(html).toContain("<h1>Note saved</h1>");
    expect(html).toContain("even if the alert to Yeehaa is delayed");
    expect(html).toContain("no need to send it again");
  });
});

describe("contact HTTP behind a TLS-terminating proxy", () => {
  // Kamal's proxy terminates TLS and forwards plain HTTP from the container network.
  const proxy = "172.18.0.2";
  function viaProxy(
    init: {
      method?: string;
      body?: string;
      headers?: Record<string, string>;
    } = {},
    protocol = "https",
  ): Request {
    return new Request("http://brain.test/contact", {
      ...init,
      headers: { "x-forwarded-proto": protocol, ...init.headers },
    });
  }
  async function behindProxy(
    trustForwardedProto: boolean,
  ): Promise<ContactHttpHandlers> {
    const f = await intakeFixture();
    return new ContactHttpHandlers(f.admission, f.intake, {
      origin,
      maxBodyBytes: 65536,
      readTimeoutMs: 10000,
      trustForwardedProto,
    });
  }

  it("serves and saves a request the proxy received over HTTPS", async () => {
    const handlers = await behindProxy(true);
    const form_ = await page(handlers, viaProxy(), proxy);
    expect(form_.status).toBe(200);
    if (!form_.token) throw new Error("Missing form token");
    const saved = await handlers.handle(
      viaProxy({
        method: "POST",
        body: form(form_.token),
        headers: {
          origin,
          "content-type": "application/x-www-form-urlencoded",
        },
      }),
      { remoteAddress: proxy },
    );
    expect(saved.status).toBe(303);
  });

  it("refuses plain HTTP unless a trusted private proxy received it over HTTPS", async () => {
    expect(
      (await page(await behindProxy(false), viaProxy(), proxy)).status,
    ).toBe(403);
    const trusting = await behindProxy(true);
    // Anyone can send the header; only the private proxy peer is believed.
    expect((await page(trusting, viaProxy(), "203.0.113.9")).status).toBe(403);
    expect((await page(trusting, viaProxy({}, "http"), proxy)).status).toBe(
      403,
    );
  });
});

describe("contact HTTP on the preview host", () => {
  const preview = "https://preview.brain.test";
  async function withPreview(
    previewOrigin?: string,
  ): Promise<ContactHttpHandlers> {
    const f = await intakeFixture();
    return new ContactHttpHandlers(
      f.admission,
      f.intake,
      { origin, maxBodyBytes: 65536, readTimeoutMs: 10000 },
      previewOrigin ? { previewOrigin } : {},
    );
  }
  function postTo(host: string, token: string, from = host): Request {
    return new Request(`${host}/contact`, {
      method: "POST",
      body: form(token),
      headers: {
        origin: from,
        "content-type": "application/x-www-form-urlencoded",
      },
    });
  }

  it("serves and saves on the preview origin it is given", async () => {
    const handlers = await withPreview(preview);
    const form_ = await page(handlers, new Request(`${preview}/contact`));
    expect(form_.status).toBe(200);
    if (!form_.token) throw new Error("Missing form token");
    const saved = await handlers.handle(postTo(preview, form_.token), {
      remoteAddress: peer,
    });
    expect(saved.status).toBe(303);
    expect(saved.headers.get("location")).toBe("/contact/thanks");
  });

  it("refuses a post from the other host, and the preview host when none is given", async () => {
    const handlers = await withPreview(preview);
    const form_ = await page(handlers, new Request(`${preview}/contact`));
    if (!form_.token) throw new Error("Missing form token");
    expect(
      (
        await handlers.handle(postTo(preview, form_.token, origin), {
          remoteAddress: peer,
        })
      ).status,
    ).toBe(403);
    expect(
      (await page(await withPreview(), new Request(`${preview}/contact`)))
        .status,
    ).toBe(403);
  });
});
