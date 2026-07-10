import type { JSX } from "preact";
import { Fragment } from "preact";
import { z } from "@brains/utils/zod";
import { enrichedBlogPostSchema } from "@brains/blog";
import { enrichedDeckSchema } from "@brains/decks";
import { createTemplate, type Template } from "@brains/templates";
import { Section } from "@brains/site-rizom";
import { IndexRow, SectCap, delayClass, type IndexRowData } from "./shared";

/**
 * /writing — the one index for everything published (rev-5 IA): two
 * bands, Essays (posts) and Talks (decks), each row linking to its
 * detail page. The query logic lives in the blog and decks plugins'
 * datasources; these templates only contribute the journal look.
 */
interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

const paginationInfoSchema: z.ZodType<PaginationInfo> = z.object({
  currentPage: z.number(),
  totalPages: z.number(),
  totalItems: z.number(),
  pageSize: z.number(),
  hasNextPage: z.boolean(),
  hasPrevPage: z.boolean(),
});

type PostItem = z.output<typeof enrichedBlogPostSchema>;

export interface WritingContent {
  posts: PostItem[];
  pagination: PaginationInfo | null;
  baseUrl?: string | undefined;
}

export const writingContentSchema: z.ZodType<WritingContent> = z.object({
  posts: z.array(enrichedBlogPostSchema),
  pagination: paginationInfoSchema.nullable(),
  baseUrl: z.string().optional(),
});

function toRow(post: PostItem, index: number): IndexRowData {
  const publishedAt = post.metadata.publishedAt ?? post.created;
  return {
    no: String(index + 1).padStart(2, "0"),
    kicker: post.frontmatter.seriesName ?? "Essay",
    title: post.metadata.title,
    text: post.frontmatter.excerpt,
    ...(post.url && { href: post.url }),
    meta: publishedAt.slice(0, 4),
  };
}

export function WritingSection({ posts }: WritingContent): JSX.Element {
  return (
    <Section id="writing" className="py-14">
      <SectCap
        lead="Writing"
        trail="— everything published, in one index · essays land as they're written"
      />
      {posts.length === 0 ? (
        <p className="reveal mt-4 max-w-[56ch] font-body text-body-md text-theme-light">
          Nothing published here yet — the first essays are moving in from the
          old rooms.
        </p>
      ) : (
        <div className="mt-2">
          {posts.map((post, i) => (
            <IndexRow
              key={post.id}
              row={toRow(post, i)}
              delayClass={delayClass(i)}
            />
          ))}
        </div>
      )}
    </Section>
  );
}

export const writingTemplate: Template = createTemplate<WritingContent>({
  name: "writing",
  description: "Published index — posts and essay series via the blog plugin",
  schema: writingContentSchema,
  dataSourceId: "blog:entities",
  requiredPermission: "public",
  layout: { component: WritingSection },
});

// --- Talks band (decks) ---

type DeckItem = z.output<typeof enrichedDeckSchema>;

export interface TalksContent {
  decks: DeckItem[];
}

export const talksContentSchema: z.ZodType<TalksContent> = z.object({
  decks: z.array(enrichedDeckSchema),
});

function deckToRow(deck: DeckItem, index: number): IndexRowData {
  const publishedAt = deck.metadata.publishedAt ?? deck.created;
  return {
    no: String(index + 1).padStart(2, "0"),
    kicker: "Talk",
    title: deck.metadata.title,
    text: deck.metadata.description ?? "",
    ...(deck.url && { href: deck.url }),
    meta: publishedAt.slice(0, 4),
  };
}

export function TalksSection({ decks }: TalksContent): JSX.Element {
  // No empty band — when there are no decks the section renders nothing,
  // so /writing stays clean until talks exist.
  if (decks.length === 0) return <Fragment />;
  return (
    <Section id="talks" className="py-14">
      <SectCap
        lead="Talks"
        trail="— decks and slides from workshops and events"
      />
      <div className="mt-2">
        {decks.map((deck, i) => (
          <IndexRow
            key={deck.id}
            row={deckToRow(deck, i)}
            delayClass={delayClass(i)}
          />
        ))}
      </div>
    </Section>
  );
}

export const talksTemplate: Template = createTemplate<TalksContent>({
  name: "writing-talks",
  description: "Published index — decks via the decks plugin",
  schema: talksContentSchema,
  dataSourceId: "decks:entities",
  requiredPermission: "public",
  layout: { component: TalksSection },
});
