import { describe, expect, it } from "bun:test";
import { renderNewsletterEmail } from "../src/email-renderer";

describe("renderNewsletterEmail", () => {
  it("renders one safe HTML document and plain-text fallback", () => {
    const result = renderNewsletterEmail({
      subject: "Weekly <Update>",
      content:
        "# Hello\n\nRead the **latest** [post](https://example.com).\n\n<script>alert('no')</script>",
      previewText: "This week's update",
    });

    expect(result.html).toContain("<!doctype html>");
    expect(result.html).toContain("<title>Weekly &lt;Update&gt;</title>");
    expect(result.html).toContain("<h1>Hello</h1>");
    expect(result.html).toContain("<strong>latest</strong>");
    expect(result.html).not.toContain("<script>alert");
    expect(result.html).toContain("This week&#39;s update");
    expect(result.text).toContain("Hello");
    expect(result.text).toContain("latest");
  });
});
