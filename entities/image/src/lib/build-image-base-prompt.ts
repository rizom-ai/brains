import type { BrainCharacter, AnchorProfile } from "@brains/plugins";

/**
 * Build a contextual base prompt for image generation.
 * Incorporates identity and profile for brand consistency.
 *
 * Used by both the image_generate tool and the image generation job handler
 * to ensure all image generation paths apply the same style prompt.
 */
export function buildImageBasePrompt(
  identity: BrainCharacter,
  profile: AnchorProfile,
): string {
  const contextParts: string[] = [];

  if (identity.name) {
    contextParts.push(`Brand/Creator: ${identity.name}`);
  }
  if (identity.role) {
    contextParts.push(`Focus: ${identity.role}`);
  }
  if (identity.values.length > 0) {
    contextParts.push(`Values: ${identity.values.join(", ")}`);
  }
  if (profile.description) {
    contextParts.push(`Context: ${profile.description}`);
  }

  const brandContext =
    contextParts.length > 0
      ? `Brand context: ${contextParts.join(". ")}.\n`
      : "";

  return `${brandContext}Medium: Dense contemporary editorial illustration rendered in clean digital linework with bold filled shapes, halftone dot textures, and screenprint-style color separations. Multiple overlapping visual planes create depth through layering, not perspective. Crisp edges, no gradients within shapes — color is applied in confident opaque blocks with occasional knockout overlaps where two colors intersect to reveal a third.
Palette: Deep electric indigo (#3921D7), burnt sienna (#E7640A), cadmium vermillion (#DC2626), warm ivory (#FFFCF6), charcoal black (#0E0027). Colors collide at full saturation — no pastels, no safe neutrals. Where indigo overlaps orange, a rich burgundy emerges. Where vermillion meets ivory, a hot coral appears. Every color earns its place.
Composition: Horror vacui — the frame is packed with interconnected visual elements at wildly different scales. A central metaphorical object anchors the scene while dozens of smaller symbolic elements orbit, overlap, and interlock around it like a visual encyclopedia entry. Diagonal flow breaks any grid. Elements bleed off all four edges suggesting the scene continues beyond the frame.
Mood: Intellectual maximalism. The density rewards close inspection — every corner contains a deliberate visual surprise. The overall feeling is of a brilliant mind mapping connections between disparate ideas. Playful but rigorous, like a PhD thesis illustrated by a street artist.
Avoid: Photorealism, photography, oil paint texture, watercolor bleed, visible brushstrokes, flat minimal vector, sparse compositions with negative space, dark fantasy, gothic imagery, medieval elements, sci-fi chrome, glass or crystal materials, lens flare, soft dreamy fog, any text or words or lettering or typography.
Subject: `;
}
