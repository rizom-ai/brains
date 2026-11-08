import {
  Card,
  TagsList,
  formatDate,
  type CardMetadataProps,
  type CardProps,
  type CardTitleProps,
  type DateFormatStyle,
  type FormatDateOptions,
  type MarkdownContentProps,
  type TagsListProps,
} from "@rizom/brain-ui";

// Compile-only: the public props and options are the shapes the components take.
const horizontal: CardProps = {
  variant: "horizontal",
  href: "/bookmarks/maintenance",
  children: "The maintenance of things",
};
export const card = <Card {...horizontal} />;

export const invalidVariant: CardProps = {
  // @ts-expect-error A card's layout is one of its three variants.
  variant: "grid",
  children: "Unknown layout",
};

export const linkedTitle: CardTitleProps = {
  href: "https://example.com/maintenance",
  children: "The maintenance of things",
};
export const metadata: CardMetadataProps = { children: "Saved today" };

const accentTags: TagsListProps = {
  tags: ["care", "infrastructure", "repair"],
  maxVisible: 2,
  variant: "accent",
  size: "sm",
};
export const tags = <TagsList {...accentTags} />;

export const note: MarkdownContentProps = {
  markdown: "Read it **slowly**.",
  className: "note",
};
// @ts-expect-error MarkdownContent renders markdown, not pre-rendered HTML.
export const html: MarkdownContentProps = { html: "<p>Read it</p>" };

const style: DateFormatStyle = "medium";
const withTime: FormatDateOptions = { style, includeTime: true };
export const saved: string = formatDate("2026-03-14T12:00:00Z", withTime);
// @ts-expect-error A date style is one of short, medium, long or full.
export const unknownStyle: DateFormatStyle = "relative";
