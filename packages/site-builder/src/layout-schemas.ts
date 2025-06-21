import { z } from "zod";
import type { LayoutDefinition } from "./types";

// Hero layout schema - expects headline and optional CTA
export const HeroLayoutSchema = z.object({
  headline: z.string(),
  subheadline: z.string(),
  ctaText: z.string().optional(),
  ctaLink: z.string().optional(),
  backgroundImage: z.string().optional(),
});

// Features layout schema - expects a grid of features
export const FeaturesLayoutSchema = z.object({
  headline: z.string(),
  subheadline: z.string().optional(),
  features: z.array(
    z.object({
      icon: z.string(),
      title: z.string(),
      description: z.string(),
    }),
  ),
});

// Products layout schema - expects product cards
export const ProductsLayoutSchema = z.object({
  headline: z.string(),
  subheadline: z.string().optional(),
  items: z.array(
    z.object({
      icon: z.string(),
      name: z.string(),
      description: z.string(),
      category: z.string(),
      status: z.string(),
      link: z.string().optional(),
    }),
  ),
});

// CTA layout schema - expects call-to-action content
export const CTALayoutSchema = z.object({
  headline: z.string(),
  subheadline: z.string().optional(),
  buttons: z.array(
    z.object({
      text: z.string(),
      link: z.string(),
      variant: z.enum(["primary", "secondary"]).optional(),
    }),
  ),
});

// Grid layout schema - generic grid container
export const GridLayoutSchema = z.object({
  columns: z.number().min(1).max(6).optional(),
  gap: z.enum(["small", "medium", "large"]).optional(),
  items: z.array(z.unknown()), // Items structure depends on usage
});

// Text layout schema - simple text content
export const TextLayoutSchema = z.object({
  content: z.string(), // Can be markdown
  align: z.enum(["left", "center", "right"]).optional(),
});

// Dashboard layout schema - stats and recent items
export const DashboardLayoutSchema = z.object({
  title: z.string(),
  stats: z.array(
    z.object({
      label: z.string(),
      value: z.union([z.string(), z.number()]),
      icon: z.string().optional(),
      trend: z
        .object({
          direction: z.enum(["up", "down", "neutral"]),
          value: z.string(),
        })
        .optional(),
    }),
  ),
  recentItems: z
    .object({
      title: z.string(),
      items: z.array(
        z.object({
          title: z.string(),
          description: z.string().optional(),
          timestamp: z.string(),
          link: z.string().optional(),
        }),
      ),
    })
    .optional(),
});

// Markdown layout schema - raw markdown renderer
export const MarkdownLayoutSchema = z.object({
  content: z.string(),
  toc: z.boolean().optional(),
  className: z.string().optional(),
});

// Built-in layout definitions
export const builtInLayouts: LayoutDefinition[] = [
  {
    name: "hero",
    schema: HeroLayoutSchema,
    component: "@brains/site-builder/layouts/hero.astro",
    description: "Hero section with headline and call-to-action",
  },
  {
    name: "features",
    schema: FeaturesLayoutSchema,
    component: "@brains/site-builder/layouts/features.astro",
    description: "Feature grid with icons",
  },
  {
    name: "products",
    schema: ProductsLayoutSchema,
    component: "@brains/site-builder/layouts/products.astro",
    description: "Product card grid",
  },
  {
    name: "cta",
    schema: CTALayoutSchema,
    component: "@brains/site-builder/layouts/cta.astro",
    description: "Call-to-action section",
  },
  {
    name: "grid",
    schema: GridLayoutSchema,
    component: "@brains/site-builder/layouts/grid.astro",
    description: "Generic grid layout",
  },
  {
    name: "text",
    schema: TextLayoutSchema,
    component: "@brains/site-builder/layouts/text.astro",
    description: "Simple text content",
  },
  {
    name: "dashboard",
    schema: DashboardLayoutSchema,
    component: "@brains/site-builder/layouts/dashboard.astro",
    description: "Dashboard with stats and recent items",
  },
  {
    name: "markdown",
    schema: MarkdownLayoutSchema,
    component: "@brains/site-builder/layouts/markdown.astro",
    description: "Markdown content renderer",
  },
];

export type BuiltInLayoutName = (typeof builtInLayouts)[number]["name"];
