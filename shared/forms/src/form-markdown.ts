import {
  generateMarkdown,
  parseMarkdown,
} from "@brains/utils/markdown-frontmatter";
import {
  formDefinitionSchema,
  formFrontmatterSchema,
  type FormDefinition,
} from "./definition";

/**
 * A form's frontmatter with an empty path read as none: such a form is
 * served beneath /forms, as any form without a path. Earlier releases
 * stored `path: ''` in a form whose file named no path.
 */
export function withoutEmptyPath(
  frontmatter: Record<string, unknown>,
): Record<string, unknown> {
  if (frontmatter["path"] !== "") return frontmatter;
  const { path: _path, ...rest } = frontmatter;
  return rest;
}

/** The form a `form` entity holds: its id is the entity's, its frontmatter
 * the rest of the definition, its body the intro. Throws when the engine
 * would not run it. */
export function parseFormMarkdown(
  id: string,
  markdown: string,
): FormDefinition {
  const { frontmatter, content } = parseMarkdown(markdown);
  return formDefinitionSchema.parse({
    ...formFrontmatterSchema.parse(withoutEmptyPath(frontmatter)),
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
