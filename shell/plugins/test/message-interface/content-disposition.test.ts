import { describe, expect, it } from "bun:test";
import { formatContentDispositionHeader } from "../../src/message-interface/content-disposition";

describe("formatContentDispositionHeader", () => {
  it("formats inline content disposition with a safe fallback filename", () => {
    expect(
      formatContentDispositionHeader({
        disposition: "inline",
        filename: 'déck "draft".pdf',
      }),
    ).toBe(
      "inline; filename=\"d_ck _draft_.pdf\"; filename*=UTF-8''d%C3%A9ck%20%22draft%22.pdf",
    );
  });

  it("formats attachment content disposition and encodes RFC 5987 specials", () => {
    expect(
      formatContentDispositionHeader({
        disposition: "attachment",
        filename: "report (final)*.pdf",
      }),
    ).toBe(
      "attachment; filename=\"report (final)*.pdf\"; filename*=UTF-8''report%20%28final%29%2A.pdf",
    );
  });

  it("removes header-breaking characters from the fallback filename", () => {
    expect(
      formatContentDispositionHeader({
        disposition: "attachment",
        filename: "bad\\name\r\n.pdf",
      }),
    ).toBe(
      "attachment; filename=\"bad_name__.pdf\"; filename*=UTF-8''bad%5Cname%0D%0A.pdf",
    );
  });
});
