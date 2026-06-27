import { StructuredContentFormatter } from "@brains/content-formatters";
import { playbookBodySchema, type PlaybookBody } from "../schemas/playbook";

export class PlaybookBodyFormatter extends StructuredContentFormatter<PlaybookBody> {
  constructor() {
    super(playbookBodySchema, {
      title: "Playbook",
      mappings: [
        { key: "purpose", label: "Purpose", type: "string" },
        {
          key: "operatingRules",
          label: "Operating Rules",
          type: "array",
          itemType: "string",
        },
        { key: "initialState", label: "Initial State", type: "string" },
        {
          key: "states",
          label: "States",
          type: "array",
          itemType: "object",
          itemMappings: [
            { key: "id", label: "ID", type: "string" },
            { key: "title", label: "Title", type: "string" },
            {
              key: "prompt",
              label: "Prompt",
              type: "custom",
              formatter: formatOptionalString,
              parser: parseOptionalString,
            },
            {
              key: "requiredDetails",
              label: "Required Details",
              type: "array",
              itemType: "string",
            },
            {
              key: "instructions",
              label: "Instructions",
              type: "array",
              itemType: "string",
            },
            {
              key: "doneWhen",
              label: "Done When",
              type: "array",
              itemType: "string",
            },
            {
              key: "transitions",
              label: "Transitions",
              type: "array",
              itemType: "object",
              itemMappings: [
                { key: "event", label: "Event", type: "string" },
                { key: "target", label: "Target", type: "string" },
                {
                  key: "operatorAction",
                  label: "User Choice",
                  type: "custom",
                  formatter: formatOptionalBoolean,
                  parser: parseOptionalBoolean,
                },
                {
                  key: "label",
                  label: "Label",
                  type: "custom",
                  formatter: formatOptionalString,
                  parser: parseOptionalString,
                },
                { key: "description", label: "Description", type: "string" },
                {
                  key: "operatorDescription",
                  label: "Operator Description",
                  type: "custom",
                  formatter: formatOptionalString,
                  parser: parseOptionalString,
                },
              ],
            },
          ],
        },
        {
          key: "finalStates",
          label: "Final States",
          type: "array",
          itemType: "string",
        },
        {
          key: "nextPrompts",
          label: "Next Prompts",
          type: "array",
          itemType: "string",
        },
      ],
    });
  }
}

export const playbookBodyFormatter = new PlaybookBodyFormatter();

function formatOptionalString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseOptionalString(text: string): string | undefined {
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function formatOptionalBoolean(value: unknown): string {
  return typeof value === "boolean" ? String(value) : "";
}

function parseOptionalBoolean(text: string): boolean | undefined {
  const trimmed = text.trim().toLowerCase();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  return undefined;
}
