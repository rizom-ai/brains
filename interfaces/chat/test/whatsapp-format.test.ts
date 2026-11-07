import { describe, expect, it } from "bun:test";
import { WhatsAppFormatConverter } from "../src/whatsapp-format";

const converter = new WhatsAppFormatConverter();

describe("WhatsAppFormatConverter", () => {
  it("writes markdown emphasis in WhatsApp syntax", () => {
    expect(converter.fromMarkdown("**Bold**, *italic* and ~~gone~~")).toBe(
      "*Bold*, _italic_ and ~gone~",
    );
  });

  it("turns headings into bold lines and keeps bullet lists", () => {
    expect(converter.fromMarkdown("## Plan\n\n- one\n- two")).toBe(
      "*Plan*\n\n- one\n- two",
    );
  });

  it("keeps inline code and fenced code without a language tag", () => {
    expect(
      converter.fromMarkdown("Run `bun test`\n\n```ts\nconst a = 1;\n```"),
    ).toBe("Run `bun test`\n\n```\nconst a = 1;\n```");
  });

  it("writes a link as its text followed by the address", () => {
    expect(
      converter.fromMarkdown("See [the docs](https://rizom.ai/docs)."),
    ).toBe("See the docs (https://rizom.ai/docs).");
  });

  it("writes a bare link once", () => {
    expect(converter.fromMarkdown("<https://rizom.ai>")).toBe(
      "https://rizom.ai",
    );
  });

  it("renders a card as its fallback text", () => {
    const text = converter.renderPostable({
      card: {
        type: "card",
        title: "Confirm",
        children: [{ type: "text", content: "Delete the note?" }],
      },
    });

    expect(text).toContain("Confirm");
    expect(text).toContain("Delete the note?");
  });

  it("reads WhatsApp bold and strikethrough back as markdown", () => {
    expect(converter.toMarkdown("*Bold* and ~gone~").trim()).toBe(
      "**Bold** and ~~gone~~",
    );
  });
});
