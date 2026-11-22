import {
  bodyFields,
  type BodyFields,
  type FieldMapping,
} from "@brains/content-formatters";
import {
  styleGuideFrontmatterSchema,
  type StyleGuide,
} from "@brains/contracts";
import { parseMarkdown } from "@brains/utils/markdown-frontmatter";

/**
 * The style guide's next stored form (docs/external-plugin-authoring.md, The stored format): its
 * name in the header, its messaging, voice and visual guidance as body
 * sections above the free-form guidance, a one-line value as a labeled
 * line and a list as a list.
 */
export const STYLE_GUIDE_BODY_FIELDS = [
  "messaging",
  "voice",
  "visual",
] as const;

const list = (key: string, label: string): FieldMapping => ({
  key,
  label,
  type: "array",
  itemType: "string",
});
const line = (key: string, label: string): FieldMapping => ({
  key,
  label,
  type: "string",
  line: true,
});

export const styleGuideBodyMappings: FieldMapping[] = [
  {
    key: "messaging",
    label: "Messaging",
    type: "object",
    children: [
      line("positioning", "Positioning"),
      list("audiences", "Audiences"),
    ],
  },
  {
    key: "voice",
    label: "Voice",
    type: "object",
    children: [
      line("summary", "Summary"),
      list("traits", "Traits"),
      list("principles", "Principles"),
      list("preferredTerms", "Preferred terms"),
      list("avoid", "Avoid"),
    ],
  },
  {
    key: "visual",
    label: "Visual",
    type: "object",
    children: [
      line("artDirection", "Art direction"),
      line("composition", "Composition"),
      line("mood", "Mood"),
      list("palette", "Palette"),
      list("preferred", "Preferred"),
      list("avoid", "Avoid"),
    ],
  },
];

export const styleGuideBody: BodyFields = bodyFields(
  styleGuideFrontmatterSchema,
  STYLE_GUIDE_BODY_FIELDS,
  { mappings: styleGuideBodyMappings, place: "above", leadHeading: "Guidance" },
);

/** The style guide a stored document holds, in either stored form. */
export function parseStyleGuideContent(content: string): StyleGuide {
  const parsed = parseMarkdown(content);
  const read = styleGuideBody.read(parsed.frontmatter, parsed.content);
  return {
    ...styleGuideFrontmatterSchema.parse(read.header),
    guidance: read.lead,
  };
}
