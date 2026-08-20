import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Footer, Header, Wordmark } from "../src/index";

/**
 * The site once forked its UI primitives from the (now folded) `@rizom/ui`
 * package, and the fork's Header and Footer drifted onto an older inline
 * wordmark while the same barrel exported the canonical `Wordmark` — two brand
 * marks on one site. These tests pin the two properties that fork lost:
 * chrome renders the canonical wordmark, and links marked `external` open
 * safely in a new tab.
 */

const internalLink = { href: "/pricing", label: "Pricing" };
const externalLink = {
  href: "https://github.com/rizom-ai",
  label: "GitHub",
  external: true,
};

const header = (): string =>
  renderToStaticMarkup(
    <Header
      brandSuffix="ai"
      navLinks={[internalLink, externalLink]}
      primaryCta={externalLink}
    />,
  );

const footer = (): string =>
  renderToStaticMarkup(
    <Footer
      brandSuffix="ai"
      metaLabel="rizom.ai"
      links={[internalLink, externalLink]}
    />,
  );

describe("rizom site brand chrome", () => {
  it("renders the canonical wordmark in the header", () => {
    const wordmark = renderToStaticMarkup(<Wordmark brandSuffix="ai" />);

    // The canonical mark styles its suffix as italic body text and colors the
    // dot per suffix; the forked inline mark did neither.
    expect(wordmark).toContain("italic");
    expect(header()).toContain("italic");
    expect(header()).toContain("text-accent-bright");
  });

  it("renders the canonical wordmark in the footer", () => {
    expect(footer()).toContain("italic");
    expect(footer()).toContain("text-accent-bright");
  });

  it("opens external links in a new tab with safe rel, internal ones in place", () => {
    for (const chrome of [header(), footer()]) {
      expect(chrome).toContain('target="_blank"');
      expect(chrome).toContain('rel="noopener noreferrer"');
      // The internal link must not inherit the external attributes.
      const internal = chrome
        .split("<a")
        .find((anchor) => anchor.includes('href="/pricing"'));
      expect(internal).toBeDefined();
      expect(internal).not.toContain("_blank");
    }
  });
});
