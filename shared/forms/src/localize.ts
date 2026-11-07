import type { FormDefinition, FormField, FormTranslation } from "./definition";

/** The languages a form is served in besides the one it is written in. */
export function formLanguages(form: FormDefinition): string[] {
  return Object.keys(form.translations ?? {});
}

function translationFor(
  form: FormDefinition,
  language: string,
): FormTranslation | undefined {
  const tag = language.toLowerCase();
  return Object.entries(form.translations ?? {}).find(
    ([key]) => key.toLowerCase() === tag,
  )?.[1];
}

function localizeField(
  field: FormField,
  translation: NonNullable<FormTranslation["fields"]>[string] | undefined,
): FormField {
  if (!translation) return field;
  const label = translation.label ?? field.label;
  if (!("options" in field)) return { ...field, label };
  return {
    ...field,
    label,
    options: field.options.map((option) => ({
      ...option,
      label: translation.options?.[option.value] ?? option.label,
    })),
  };
}

/**
 * The form as it is served in a language: at `/<lang>/<path>`, each string
 * the translation gives in that language and every other as written. A
 * language the form has no translation for is the form itself.
 */
export function localizeForm(
  form: FormDefinition,
  language: string,
): FormDefinition {
  const translation = translationFor(form, language);
  if (!translation) return form;
  return {
    ...form,
    path: `/${language.toLowerCase()}${form.path}`,
    title: translation.title ?? form.title,
    pageTitle: translation.pageTitle ?? translation.title ?? form.pageTitle,
    intro: translation.intro ?? form.intro,
    submitLabel: translation.submitLabel ?? form.submitLabel,
    thanks: {
      title: translation.thanks?.title ?? form.thanks.title,
      body: translation.thanks?.body ?? form.thanks.body,
    },
    steps: form.steps.map((step, index) => ({
      ...step,
      title: translation.steps?.[index]?.title ?? step.title,
      fields: step.fields.map((field) =>
        localizeField(field, translation.fields?.[field.id]),
      ),
    })),
    ...(form.scoring
      ? {
          scoring: {
            dimensions: form.scoring.dimensions.map((dimension) => {
              const words = translation.dimensions?.[dimension.id];
              return {
                ...dimension,
                title: words?.title ?? dimension.title,
                outcomes: dimension.outcomes.map((outcome) => ({
                  ...outcome,
                  title: words?.outcomes?.[outcome.id]?.title ?? outcome.title,
                  body: words?.outcomes?.[outcome.id]?.body ?? outcome.body,
                })),
              };
            }),
          },
        }
      : {}),
  };
}
