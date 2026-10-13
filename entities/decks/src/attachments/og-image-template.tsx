import type { JSX } from "react";
import { z } from "@brains/utils/zod";
import { OgCard } from "@brains/ui-library";
import { createTemplate, type Template } from "@brains/plugins";

export const DECK_OG_IMAGE_ATTACHMENT_TYPE = "og-image";
export const DECK_OG_IMAGE_TEMPLATE_NAME = "decks:og-image";

export const deckOgImageTemplateSchema: z.ZodObject<{
  title: z.ZodString;
  description: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  event: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  brandLabel: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  slideCount: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
  coverImageUrl: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}> = z.object({
  title: z.string().min(1),
  description: z.string().nullable().default(null),
  event: z.string().nullable().default(null),
  brandLabel: z.string().nullable().default(null),
  slideCount: z.number().int().positive().nullable().default(null),
  coverImageUrl: z.string().nullable().default(null),
});

export type DeckOgImageTemplateData = z.output<
  typeof deckOgImageTemplateSchema
>;

/** What a provider builds; absent fields render as null. */
export type DeckOgImageTemplateInput = z.input<
  typeof deckOgImageTemplateSchema
>;

export const deckOgImageTemplate: Template =
  createTemplate<DeckOgImageTemplateData>({
    name: "og-image",
    description: "Open Graph image for a deck",
    schema: deckOgImageTemplateSchema,
    requiredPermission: "public",
    layout: { formats: { image: renderDeckOgImage } },
  });

function renderDeckOgImage(data: DeckOgImageTemplateData): JSX.Element {
  const countLabel = data.slideCount
    ? `${data.slideCount} slide${data.slideCount === 1 ? "" : "s"}`
    : undefined;

  return (
    <OgCard
      brandLabel={data.brandLabel ?? data.title}
      eyebrow="Deck"
      title={data.title}
      subtitle={data.description ?? undefined}
      meta={[data.event ?? undefined]}
      tag={countLabel}
    />
  );
}
