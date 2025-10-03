/**
 * Props for head metadata
 */
export interface HeadProps {
  title: string;
  description?: string;
  ogImage?: string;
  ogType?: string;
  twitterCard?: string;
  canonicalUrl?: string;
}

/**
 * Simple head collector for SSR
 * Collects head props from components during rendering
 */
export class HeadCollector {
  private headProps: HeadProps | null = null;

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
    const tags: string[] = [];

    // Essential meta tags (always included)
    tags.push('<meta charset="UTF-8">');
    tags.push(
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    );
    tags.push('<meta http-equiv="X-UA-Compatible" content="IE=edge">');

    // Favicons (always included)
    tags.push('<link rel="icon" type="image/svg+xml" href="/favicon.svg">');
    tags.push('<link rel="icon" type="image/png" href="/favicon.png">');

    // Styles (always included)
    tags.push('<link rel="stylesheet" href="/styles/main.css">');

    if (!this.headProps) {
      tags.push("<title>Personal Brain</title>");
      return tags.join("\n    ");
    }

    const { title, description, ogImage, ogType, twitterCard, canonicalUrl } =
      this.headProps;

    // Page-specific meta tags
    tags.push(`<title>${this.escapeHtml(title)}</title>`);

    if (description) {
      tags.push(
        `<meta name="description" content="${this.escapeHtml(description)}">`,
      );
    }

    // Open Graph
    tags.push(`<meta property="og:title" content="${this.escapeHtml(title)}">`);
    if (description) {
      tags.push(
        `<meta property="og:description" content="${this.escapeHtml(description)}">`,
      );
    }
    tags.push(`<meta property="og:type" content="${ogType ?? "website"}">`);
    if (ogImage) {
      tags.push(
        `<meta property="og:image" content="${this.escapeHtml(ogImage)}">`,
      );
    }

    // Twitter Card
    tags.push(
      `<meta name="twitter:card" content="${twitterCard ?? "summary_large_image"}">`,
    );
    tags.push(
      `<meta name="twitter:title" content="${this.escapeHtml(title)}">`,
    );
    if (description) {
      tags.push(
        `<meta name="twitter:description" content="${this.escapeHtml(description)}">`,
      );
    }
    if (ogImage) {
      tags.push(
        `<meta name="twitter:image" content="${this.escapeHtml(ogImage)}">`,
      );
    }

    // Canonical URL
    if (canonicalUrl) {
      tags.push(
        `<link rel="canonical" href="${this.escapeHtml(canonicalUrl)}">`,
      );
    }

    return tags.join("\n    ");
  }

  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return text.replace(/[&<>"']/g, (m) => map[m] ?? m);
  }
}
