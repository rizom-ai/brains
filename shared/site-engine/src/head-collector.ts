import type { HeadProps, HeadCollectorInterface } from "@brains/contracts";
import { escapeHtml } from "@brains/utils/string-utils";
import { essentialHeadTags } from "./essential-head";

/**
 * Simple head collector for SSR
 * Collects head props from components during rendering
 */
export class HeadCollector implements HeadCollectorInterface {
  private headProps: HeadProps | null = null;
  private defaultTitle: string;

  constructor(defaultTitle: string) {
    this.defaultTitle = defaultTitle;
  }

  setHeadProps(props: HeadProps): void {
    // Only keep the first Head component's props (usually from the page)
    this.headProps ??= props;
  }

  getHeadProps(): HeadProps | null {
    return this.headProps;
  }

  reset(): void {
    this.headProps = null;
  }

  /**
   * Generate HTML string for the head section
   */
  generateHeadHTML(): string {
    const tags: string[] = [
      ...essentialHeadTags(),
      '<meta http-equiv="X-UA-Compatible" content="IE=edge">',
    ];

    if (!this.headProps) {
      tags.push(`<title>${escapeHtml(this.defaultTitle)}</title>`);
      return tags.join("\n    ");
    }

    const { title, description, ogImage, ogType, twitterCard, canonicalUrl } =
      this.headProps;

    // Page-specific meta tags
    tags.push(`<title>${escapeHtml(title)}</title>`);

    if (description) {
      tags.push(
        `<meta name="description" content="${escapeHtml(description)}">`,
      );
    }

    // Open Graph
    tags.push(`<meta property="og:title" content="${escapeHtml(title)}">`);
    if (description) {
      tags.push(
        `<meta property="og:description" content="${escapeHtml(description)}">`,
      );
    }
    tags.push(`<meta property="og:type" content="${ogType ?? "website"}">`);
    if (ogImage) {
      tags.push(`<meta property="og:image" content="${escapeHtml(ogImage)}">`);
    }

    // Twitter Card
    tags.push(
      `<meta name="twitter:card" content="${twitterCard ?? "summary_large_image"}">`,
    );
    tags.push(`<meta name="twitter:title" content="${escapeHtml(title)}">`);
    if (description) {
      tags.push(
        `<meta name="twitter:description" content="${escapeHtml(description)}">`,
      );
    }
    if (ogImage) {
      tags.push(`<meta name="twitter:image" content="${escapeHtml(ogImage)}">`);
    }

    // Canonical URL
    if (canonicalUrl) {
      tags.push(`<link rel="canonical" href="${escapeHtml(canonicalUrl)}">`);
    }

    return tags.join("\n    ");
  }
}
