import { describe, expect, it } from "bun:test";
import { GROUPING_DEFINITIONS_TYPE } from "../../src/grouping-definitions-contract";
import type { TypeSchema } from "./api";
import { createEditorDocument } from "./editor-document";
import {
  editorWorkflowReducer,
  initialEditorWorkflowState,
  type EditorWorkflowState,
} from "./editor-workflow";
import { isEditorSaveBlocked, type EditorSaveModel } from "./editor-save-rule";

const schema: TypeSchema = {
  entityType: "post",
  format: "frontmatter",
  isSingleton: false,
  hasBody: true,
  fields: [],
};

function editing(): EditorWorkflowState {
  return editorWorkflowReducer(initialEditorWorkflowState, {
    type: "documentOpened",
    document: createEditorDocument({
      id: "field-notes",
      entityType: "post",
      frontmatter: { title: "Field notes" },
      body: "Body",
      contentHash: "hash-1",
      created: "2026-07-14T08:00:00.000Z",
      updated: "2026-07-14T09:00:00.000Z",
    }),
  });
}

function model(overrides: Partial<EditorSaveModel> = {}): EditorSaveModel {
  return {
    canEdit: true,
    destinationBlocked: false,
    selectedEntityType: "post",
    entitySchema: schema,
    ...overrides,
  };
}

describe("isEditorSaveBlocked", () => {
  it("allows saving an editable document", () => {
    expect(isEditorSaveBlocked(editing(), model(), false)).toBe(false);
  });

  it("blocks when the caller cannot edit", () => {
    expect(
      isEditorSaveBlocked(editing(), model({ canEdit: false }), true),
    ).toBe(true);
  });

  it("blocks while a compound field is invalid or still pending", () => {
    const state: EditorWorkflowState = {
      ...editing(),
      compoundFields: { groupings: { pendingChanges: false, invalid: true } },
    };
    expect(isEditorSaveBlocked(state, model(), true)).toBe(true);
  });

  it("blocks while the creation destination is unresolved", () => {
    expect(
      isEditorSaveBlocked(editing(), model({ destinationBlocked: true }), true),
    ).toBe(true);
  });

  it("blocks while a save is running", () => {
    const state: EditorWorkflowState = {
      ...editing(),
      save: { kind: "saving" },
    };
    expect(isEditorSaveBlocked(state, model(), true)).toBe(true);
  });

  it("blocks an unchanged new singleton, which would still write", () => {
    const state = editorWorkflowReducer(initialEditorWorkflowState, {
      type: "creationStarted",
      singleton: true,
      draft: {},
    });
    const singleton = model({ entitySchema: { ...schema, isSingleton: true } });
    expect(isEditorSaveBlocked(state, singleton, false)).toBe(true);
    expect(isEditorSaveBlocked(state, singleton, true)).toBe(false);
  });

  it("blocks grouping definitions without their schema, and unchanged ones", () => {
    const definitions = model({
      selectedEntityType: GROUPING_DEFINITIONS_TYPE,
    });
    expect(isEditorSaveBlocked(editing(), definitions, true)).toBe(true);

    const loaded = model({
      selectedEntityType: GROUPING_DEFINITIONS_TYPE,
      entitySchema: {
        ...schema,
        groupingDefinitions: {
          contributorTypes: [],
          systemTypes: [],
          issues: [],
        },
      },
    });
    expect(isEditorSaveBlocked(editing(), loaded, false)).toBe(true);
    expect(isEditorSaveBlocked(editing(), loaded, true)).toBe(false);
  });
});
