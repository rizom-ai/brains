import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SocialLinks } from "../src/SocialLinks";

describe("SocialLinks", () => {
  it("draws a podcast link with its icon and name", () => {
    const markup = renderToStaticMarkup(
      <SocialLinks
        links={[
          {
            platform: "podcast",
            url: "https://podcasts.apple.com/tw/podcast/id1674146827",
          },
        ]}
      />,
    );

    expect(markup).toContain(
      'href="https://podcasts.apple.com/tw/podcast/id1674146827"',
    );
    expect(markup).toContain('aria-label="Podcast"');
    expect(markup).toContain("<svg");
  });

  it("names a platform the way the platform writes itself", () => {
    const markup = renderToStaticMarkup(
      <SocialLinks
        links={[
          { platform: "github", url: "https://github.com/rizom-ai" },
          { platform: "linkedin", url: "https://linkedin.com/company/x" },
        ]}
      />,
    );

    expect(markup).toContain('aria-label="GitHub"');
    expect(markup).toContain('aria-label="LinkedIn"');
  });
});
