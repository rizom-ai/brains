import {
  generateMarkdown,
  parseMarkdown,
} from "@brains/utils/markdown-frontmatter";
import {
  formDefinitionSchema,
  formFrontmatterSchema,
  type FormDefinition,
} from "./definition";

/** The form a `form` entity holds: its id is the entity's, its frontmatter
 * the rest of the definition, its body the intro. Throws when the engine
 * would not run it. */
export function parseFormMarkdown(
  id: string,
  markdown: string,
): FormDefinition {
  const { frontmatter, content } = parseMarkdown(markdown);
  return formDefinitionSchema.parse({
    ...formFrontmatterSchema.parse(frontmatter),
    id,
    ...(content ? { intro: content } : {}),
  });
}

/** A form as a `form` entity's markdown. */
export function formMarkdown(form: FormDefinition): string {
  const { id: _id, intro, ...rest } = form;
  return generateMarkdown(
    formFrontmatterSchema.parse(JSON.parse(JSON.stringify(rest))),
    intro ?? "",
  );
}
