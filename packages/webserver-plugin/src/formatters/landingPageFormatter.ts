import type { ContentFormatter } from "@brains/types";
import { landingPageSchema, type LandingPageData } from "../content-schemas";
import { remark } from "remark";
import type { Root, Heading, Paragraph, Content } from "mdast";

export class LandingPageFormatter implements ContentFormatter<LandingPageData> {
  public format(data: LandingPageData): string {
    return `# Landing Page Configuration

## Title
${data.title}

## Tagline
${data.tagline}

## Hero
### Headline
${data.hero.headline}

### Subheadline
${data.hero.subheadline}

### CTA Text
${data.hero.ctaText}

### CTA Link
${data.hero.ctaLink}
`;
  }

  public parse(content: string): LandingPageData {
    const processor = remark();
    const tree = processor.parse(content) as Root;

    const sections = this.extractSections(tree);

    // Extract values from sections
    const title = this.getTextFromSection(sections, "title");
    const tagline = this.getTextFromSection(sections, "tagline");

    // Extract hero subsections
    const heroSection = sections.get("hero");
    if (!heroSection) {
      throw new Error("Missing Hero section");
    }

    const heroSubsections = this.extractSubsections(heroSection);
    const headline = this.getTextFromSection(heroSubsections, "headline");
    const subheadline = this.getTextFromSection(heroSubsections, "subheadline");
    const ctaText = this.getTextFromSection(heroSubsections, "cta text");
    const ctaLink = this.getTextFromSection(heroSubsections, "cta link");

    // Build data object
    const data = {
      title,
      tagline,
      hero: {
        headline,
        subheadline,
        ctaText,
        ctaLink,
      },
    };

    // Validate with schema
    return landingPageSchema.parse(data);
  }

  private extractSections(tree: Root): Map<string, Content[]> {
    const sections = new Map<string, Content[]>();
    let currentSection: string | null = null;
    let currentContent: Content[] = [];

    for (const node of tree.children) {
      if (node.type === "heading" && node.depth === 2) {
        // Save previous section if exists
        if (currentSection) {
          sections.set(currentSection.toLowerCase(), currentContent);
        }

        // Start new section
        currentSection = this.getHeadingText(node);
        currentContent = [];
      } else if (currentSection) {
        currentContent.push(node);
      }
    }

    // Save last section
    if (currentSection) {
      sections.set(currentSection.toLowerCase(), currentContent);
    }

    return sections;
  }

  private extractSubsections(content: Content[]): Map<string, Content[]> {
    const subsections = new Map<string, Content[]>();
    let currentSubsection: string | null = null;
    let currentContent: Content[] = [];

    for (const node of content) {
      if (node.type === "heading" && node.depth === 3) {
        // Save previous subsection if exists
        if (currentSubsection) {
          subsections.set(currentSubsection.toLowerCase(), currentContent);
        }

        // Start new subsection
        currentSubsection = this.getHeadingText(node);
        currentContent = [];
      } else if (currentSubsection) {
        currentContent.push(node);
      }
    }

    // Save last subsection
    if (currentSubsection) {
      subsections.set(currentSubsection.toLowerCase(), currentContent);
    }

    return subsections;
  }

  private getHeadingText(heading: Heading): string {
    const textNodes = heading.children.filter((child) => child.type === "text");
    return textNodes.map((node) => (node as any).value).join("");
  }

  private getTextFromSection(
    sections: Map<string, Content[]>,
    key: string,
  ): string {
    const content = sections.get(key);
    if (!content) {
      throw new Error(`Missing section: ${key}`);
    }

    // Collect all text from all paragraphs in the section
    const textParts: string[] = [];

    for (const node of content) {
      if (node.type === "paragraph") {
        const paragraph = node as Paragraph;
        const text = this.extractTextFromParagraph(paragraph);
        if (text) {
          textParts.push(text);
        }
      }
    }

    if (textParts.length === 0) {
      throw new Error(`No text content found in section: ${key}`);
    }

    // Join multiple paragraphs with newlines
    return textParts.join("\n");
  }

  private extractTextFromParagraph(paragraph: Paragraph): string {
    const parts: string[] = [];

    for (const child of paragraph.children) {
      if (child.type === "text") {
        parts.push((child as any).value);
      }
    }

    return parts.join("").trim();
  }
}
