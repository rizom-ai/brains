import { describe, expect, it } from "bun:test";
import { fileURLToPath } from "node:url";
import type { InboundEmail } from "@brains/contracts";
import { getErrorMessage } from "@brains/utils/error";
import { parseInboundEmail } from "../src/inbound-email";

function parse(body: string, headers: string[] = []): Promise<InboundEmail> {
  const source = Buffer.from(
    [
      "From: Sender <sender@example.com>",
      "To: reader@example.net",
      "Message-ID: <parser-fixture@example.com>",
      ...headers,
      "",
      body,
    ].join("\r\n"),
    "latin1",
  );
  return parseInboundEmail(
    { uid: 7, source, receivedAt: new Date("2026-04-15T09:00:00Z") },
    "imap:parser-fixture",
  );
}

async function parseFrom(from: string): Promise<InboundEmail> {
  return parseInboundEmail(
    {
      uid: 7,
      source: Buffer.from(`From: ${from}\r\n\r\nBody`),
      receivedAt: new Date("2026-04-15T09:00:00Z"),
    },
    "imap:parser-fixture",
  );
}

async function expectRefusal(
  result: Promise<unknown>,
  message: string,
): Promise<void> {
  try {
    await result;
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect(getErrorMessage(error, "")).toContain(message);
    return;
  }
  throw new Error("Expected mail parsing to reject");
}

describe("inbound mail parser boundaries", () => {
  it("does not treat a bracket in display text as a domain literal hiding a comment", async () => {
    const email = await parseFrom(
      "[ ( ] <known@example.com> ) <actual@example.net>",
    );
    expect(email.from.address).toBe("actual@example.net");
  });

  it("keeps an escaped closing parenthesis inside its comment", async () => {
    const email = await parseFrom(
      "(note\\) <known@example.com>) <actual@example.net>",
    );
    expect(email.from.address).toBe("actual@example.net");
  });

  it("does not concatenate a second domain across a comment", async () => {
    const email = await parseFrom("user@example.com(comment)evil.com");
    expect(email.from.address).toBe("user@example.com");
  });

  it("does not promote an address hidden inside an encoded display name", async () => {
    const display = Buffer.from("known@example.com").toString("base64");
    const email = await parseFrom(
      `=?utf-8?B?${display}?= <actual@example.net>`,
    );
    expect(email.from).toEqual({
      address: "actual@example.net",
      name: "known@example.com",
    });
  });

  it("keeps the existing strict address-schema refusal for quoted local parts", async () => {
    await expectRefusal(
      parseFrom('"user@other.example"@example.com'),
      "Invalid email address",
    );
  });

  it("retains folded headers, references, and transport provenance", async () => {
    const email = await parse("body", [
      "Subject: =?UTF-8?Q?caf=C3=A9?=",
      "List-Unsubscribe: <mailto:leave@example.net>,",
      " <https://example.net/unsubscribe>",
      "In-Reply-To: <parent@example.com>",
      "References: <first@example.com> <parent@example.com>",
      "Auto-Submitted: auto-generated",
    ]);
    expect(email.subject).toBe("café");
    expect(email.headers).toEqual({
      listUnsubscribe:
        "<mailto:leave@example.net>,\r\n <https://example.net/unsubscribe>",
      inReplyTo: "<parent@example.com>",
      references: ["<first@example.com>", "<parent@example.com>"],
      autoSubmitted: "auto-generated",
    });
    expect([email.messageId, email.sourceRef, email.receivedAt]).toEqual([
      "<parser-fixture@example.com>",
      "imap:parser-fixture",
      "2026-04-15T09:00:00.000Z",
    ]);
  });

  it("prefers an extended charset over a later plain fallback", async () => {
    const email = await parse("caf\xe9", [
      "Content-Type: text/plain; charset*=us-ascii''iso-8859-1; charset=utf-8",
    ]);
    expect(email.text).toBe("café");
  });

  it("handles prototype-named continuation parameters without inherited state", () => {
    const child = Bun.spawnSync(
      [
        "bun",
        "--no-env-file",
        fileURLToPath(
          new URL("./fixtures/mail-parser-prototype.ts", import.meta.url),
        ),
      ],
      { stdout: "pipe", stderr: "pipe", timeout: 2000 },
    );
    expect(child.stderr.toString()).toBe("");
    expect(child.exitCode).toBe(0);
    expect(child.stdout.toString().trim()).toBe("prototype-safe-mail-ok");
  });

  for (const [charset, hex] of [
    ["iso-2022-jp", "1b2442467c4b5c386c1b2842"],
    ["euc-jp", "c6fccbdcb8ec"],
    ["shift_jis", "93fa967b8cea"],
  ]) {
    it(`decodes ${charset} text through the existing charset selection`, async () => {
      const email = await parse(
        Buffer.from(hex ?? "", "hex").toString("base64"),
        [
          `Content-Type: text/plain; charset=${charset}`,
          "Content-Transfer-Encoding: base64",
        ],
      );
      expect(email.text).toBe("日本語");
    });
  }

  it("decodes separately padded base64 segments without dropping successors", async () => {
    const email = await parse("YQ==\r\nYmM=\r\nZA==", [
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: base64",
    ]);
    expect(email.text).toBe("abcd");
  });

  it("preserves raw eight-bit bytes in a quoted-printable body", async () => {
    const email = await parse("caf\xe9 =\r\nnext", [
      "Content-Type: text/plain; charset=iso-8859-1",
      "Content-Transfer-Encoding: quoted-printable",
    ]);
    expect(email.text).toBe("café next");
  });

  it("preserves flowed base64 and quoted-printable text", async () => {
    const flowed = await parse(
      Buffer.from("one \r\ntwo\r\n-- \r\nsignature").toString("base64"),
      [
        "Content-Type: text/plain; format=flowed; delsp=yes",
        "Content-Transfer-Encoding: base64",
      ],
    );
    expect(flowed.text).toBe("onetwo\n-- \nsignature");
    const quoted = await parse("caf=C3=A9 =\r\nnext", [
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: quoted-printable",
    ]);
    expect(quoted.text).toBe("café next");
  });

  it("ignores a closed nested multipart's epilogue and retains the next sibling", async () => {
    const email = await parse(
      [
        "--outer",
        'Content-Type: multipart/mixed; boundary="inner"',
        "",
        "--inner",
        "Content-Type: text/plain",
        "",
        "first",
        "--inner--",
        "--inner",
        "Content-Type: text/plain",
        "",
        "not-content",
        "--inner--",
        "--outer",
        "Content-Type: text/plain",
        "",
        "next",
        "--outer--",
      ].join("\r\n"),
      ['Content-Type: multipart/mixed; boundary="outer"'],
    );
    expect(email.text).toBe("first\nnext");
  });

  it("converts HTML to text without treating the retained HTML as sanitized", async () => {
    const html =
      '<p>Hello &amp; <strong>world</strong></p><ul><li>One</li><li>Two</li></ul><script>not-text</script><img src="https://example.net/pixel" onerror="authored()">';
    const email = await parse(html, ["Content-Type: text/html; charset=utf-8"]);
    expect(email.text).toBe(
      "Hello & world\n\n * One\n * Two\n\n[https://example.net/pixel]",
    );
    expect(email.html).toBe(html);
  });

  it("keeps inline CID references instead of expanding image attachments", async () => {
    const email = await parse(
      [
        "--related",
        "Content-Type: text/html",
        "",
        '<p>hello</p><img src="cid:picture">',
        "--related",
        "Content-Type: image/png",
        "Content-ID: <picture>",
        "Content-Transfer-Encoding: base64",
        "",
        "aW1hZ2U=",
        "--related--",
      ].join("\r\n"),
      ['Content-Type: multipart/related; boundary="related"'],
    );
    expect(email.html).toBe('<p>hello</p><img src="cid:picture">');
    expect(email.text).toBe("");
    expect(Object.hasOwn(email, "attachments")).toBe(false);
  });

  it("preserves a long unbroken body rather than mistaking its tail for a boundary", async () => {
    const body = "x".repeat(70_000) + "--not-a-boundary";
    const email = await parse(body);
    expect(email.text).toBe(body);
  });

  it("refuses an oversized MIME header and permits subsequent ordinary mail", async () => {
    await expectRefusal(
      parse("body", ["X-Pad: " + "x".repeat(1024 * 1024)]),
      "Max header size for a MIME node exceeded",
    );
    expect((await parse("after refusal")).text).toBe("after refusal");
  });
});
