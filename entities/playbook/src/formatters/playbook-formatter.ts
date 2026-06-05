import { StructuredContentFormatter } from "@brains/content-formatters";
import { playbookBodySchema, type PlaybookBody } from "../schemas/playbook";

function formatBoolean(value: unknown): string {
  return value === true ? "true" : "false";
}

function parseBoolean(value: string): boolean {
  return value.trim().toLowerCase() === "true";
}

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
              key: "instructions",
              label: "Instructions",
              type: "array",
              itemType: "string",
            },
            {
              key: "completionCriteria",
              label: "Completion Criteria",
              type: "array",
              itemType: "string",
            },
            {
              key: "expectedEntities",
              label: "Expected Entity Refs",
              type: "array",
              itemType: "object",
              itemMappings: [
                { key: "entityType", label: "Entity Type", type: "string" },
                { key: "purpose", label: "Purpose", type: "string" },
                {
                  key: "required",
                  label: "Required",
                  type: "custom",
                  formatter: formatBoolean,
                  parser: parseBoolean,
                },
              ],
            },
            {
              key: "transitions",
              label: "Transitions",
              type: "array",
              itemType: "object",
              itemMappings: [
                { key: "event", label: "Event", type: "string" },
                { key: "target", label: "Target", type: "string" },
                { key: "description", label: "Description", type: "string" },
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
