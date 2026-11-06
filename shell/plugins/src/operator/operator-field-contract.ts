import { z } from "@brains/utils/zod";

/** Host-rendered scalar controls shared by Account and Studio action forms. */
export const operatorFieldControlSchema: z.ZodEnum<{
  text: "text";
  url: "url";
  number: "number";
  checkbox: "checkbox";
  select: "select";
  textarea: "textarea";
}> = z.enum(["text", "url", "number", "checkbox", "select", "textarea"]);

export type OperatorFieldControl = z.output<typeof operatorFieldControlSchema>;

export const accountSettingsControlSchema: z.ZodEnum<{
  text: "text";
  url: "url";
  number: "number";
  checkbox: "checkbox";
}> = operatorFieldControlSchema.exclude(["select", "textarea"]);

export type AccountSettingsControl = z.output<
  typeof accountSettingsControlSchema
>;

export interface OperatorFieldDefinitionBase<
  TControl extends OperatorFieldControl = OperatorFieldControl,
> {
  readonly label: string;
  readonly control: TControl;
  readonly secret?: boolean | undefined;
}
