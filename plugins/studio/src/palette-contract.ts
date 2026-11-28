import { z } from "@brains/utils/zod";

/** One door in the ⌘K palette: a page or an entry the caller may open. */
export interface StudioPaletteItem {
  id: string;
  title: string;
  /** Where it lives or what it is ("Library", "Post"). */
  sub?: string | undefined;
  href: string;
}

export interface StudioPaletteGroup {
  id: "pages" | "entries";
  label: string;
  items: StudioPaletteItem[];
}

/** What Studio's palette route answers for one caller and query. */
export interface StudioPalette {
  groups: StudioPaletteGroup[];
}

const paletteItemSchema = z.strictObject({
  id: z.string().min(1).max(500),
  title: z.string().max(500),
  sub: z.string().max(200).optional(),
  href: z.string().min(1).max(2_000),
});

export const studioPaletteSchema: z.ZodType<StudioPalette> = z.strictObject({
  groups: z
    .array(
      z.strictObject({
        id: z.enum(["pages", "entries"]),
        label: z.string().min(1).max(100),
        items: z.array(paletteItemSchema).max(20),
      }),
    )
    .max(4),
});
