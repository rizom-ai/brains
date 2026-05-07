import type { EcosystemContent } from "./schemas/ecosystem-section";
import { ecosystemContentSchema } from "./schemas/ecosystem-section";

function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\n[\s\S]*?\n---\n?/, "");
}

function readTopSection(markdown: string, heading: string): string {
  const pattern = new RegExp(
    `(?:^|\\n)## ${heading}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`,
  );
  return pattern.exec(markdown)?.[1]?.trim() ?? "";
}

function readCardField(markdown: string, heading: string): string {
  const pattern = new RegExp(
    `(?:^|\\n)#### ${heading}\\s*\\n([\\s\\S]*?)(?=\\n#### |\\n### |$)`,
  );
  return pattern.exec(markdown)?.[1]?.trim() ?? "";
}

export function parseEcosystemContent(markdown: string): EcosystemContent {
  const body = stripFrontmatter(markdown);
  const cardsBlock = readTopSection(body, "Cards");
  const cardBlocks = cardsBlock
    .split(/^### Card \d+\s*$/m)
    .map((block) => block.trim())
    .filter(Boolean);

  return ecosystemContentSchema.parse({
    eyebrow: readTopSection(body, "Eyebrow"),
    headline: readTopSection(body, "Headline"),
    cards: cardBlocks.map((block) => ({
      suffix: readCardField(block, "Suffix"),
      title: readCardField(block, "Title"),
      body: readCardField(block, "Body"),
      linkLabel: readCardField(block, "Link Label"),
      linkHref: readCardField(block, "Link Href"),
    })),
  });
}

export function formatEcosystemContent(content: EcosystemContent): string {
  return [
    "# Ecosystem Section",
    "",
    "## Eyebrow",
    content.eyebrow,
    "",
    "## Headline",
    content.headline,
    "",
    "## Cards",
    "",
    ...content.cards.flatMap((card, index) => [
      `### Card ${index + 1}`,
      "",
      "#### Suffix",
      card.suffix,
      "",
      "#### Title",
      card.title,
      "",
      "#### Body",
      card.body,
      "",
      "#### Link Label",
      card.linkLabel,
      "",
      "#### Link Href",
      card.linkHref,
      "",
    ]),
  ].join("\n");
}
