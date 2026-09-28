/** @jsxImportSource react */
import type { ReactElement } from "react";
import { GROUPING_DEFINITIONS_TYPE } from "../../src/grouping-definitions-contract";
import type { FieldDescriptor } from "./api";
import type { StudioAppViewProps } from "./app-view-props";
import { editorDocumentKey } from "./editor-workflow";
import { Field, FieldAssistControls, isFieldVisible } from "./entity-fields";
import type { StudioAppModel } from "./studio-app-model";
import { editorLayoutStyles as layout } from "./studio-editor-layout.styles";
import { editorClassName as editorClass } from "./studio-editor.styles";
import { StudioGroupingDefinitionsField } from "./studio-grouping-definitions-field";
import { StudioStatus } from "./studio-status";
import { StudioSystemFields } from "./studio-system-fields";

/** The editor's property fields: system-designed or one row per field. */
export function StudioEditorFields(
  props: StudioAppViewProps & { model: StudioAppModel },
): ReactElement {
  const { editor, dispatchEditor, fieldAssistState } = props;
  const { mode, draft, body } = editor;
  const {
    entitySchema,
    presentation,
    selectedEntityType,
    groupingFields,
    groupingVocabularies,
    systemDesign,
    canEdit,
    canAssist,
    fieldIssues,
  } = props.model;
  const documentKey = editorDocumentKey(selectedEntityType, mode);
  const assistAvailable =
    canAssist && entitySchema.hasBody && body.trim().length > 0;
  // A model never sees a closed list, so it could only propose values the
  // save would refuse.
  const assistFor = (descriptor: FieldDescriptor): ReactElement | null =>
    assistAvailable && !groupingVocabularies[descriptor.name]?.values ? (
      <FieldAssistControls
        descriptor={descriptor}
        state={fieldAssistState}
        onRun={props.runFieldAssist}
        onApply={props.applyFieldAssist}
        onDiscard={() => props.setFieldAssistState({ kind: "idle" })}
      />
    ) : null;
  const onFieldChange = (descriptor: FieldDescriptor, raw: unknown): void =>
    dispatchEditor({ type: "fieldChanged", descriptor, raw });
  const definitions = selectedEntityType === GROUPING_DEFINITIONS_TYPE;

  return (
    <fieldset className={editorClass("", layout.fields)} disabled={!canEdit}>
      {systemDesign ? (
        <>
          {definitions &&
            (entitySchema.groupingDefinitions ? (
              <StudioGroupingDefinitionsField
                editor={editor}
                schema={entitySchema.groupingDefinitions}
                readOnly={!canEdit}
                dispatch={dispatchEditor}
              />
            ) : (
              <StudioStatus tone="error">
                Grouping definitions are unavailable. Reload before editing.
              </StudioStatus>
            ))}
          <StudioSystemFields
            vocabularies={groupingVocabularies}
            literalFields={groupingFields}
            suggestions={props.groupingSuggestions}
            fields={
              definitions
                ? entitySchema.fields.filter(
                    (field) => field.name !== "groupings",
                  )
                : entitySchema.fields
            }
            draft={draft}
            title={presentation === "document" ? "" : systemDesign.fieldsTitle}
            readOnly={!canEdit}
            issues={fieldIssues}
            onChange={onFieldChange}
            renderAssist={assistFor}
          />
        </>
      ) : (
        entitySchema.fields
          .filter((descriptor) => isFieldVisible(descriptor, draft))
          .map((descriptor) => (
            <div
              key={`${documentKey}:${descriptor.name}`}
              data-studio-field-assist=""
            >
              <Field
                readOnly={!canEdit}
                vocabulary={groupingVocabularies[descriptor.name]}
                literalList={groupingFields.includes(descriptor.name)}
                suggestions={props.groupingSuggestions?.[descriptor.name]}
                descriptor={descriptor}
                issues={fieldIssues}
                value={draft[descriptor.name]}
                onChange={(raw) => onFieldChange(descriptor, raw)}
              />
              {assistFor(descriptor)}
            </div>
          ))
      )}
      {entitySchema.format === "raw" && (
        <StudioStatus>
          This type is raw markdown — the whole document is the body.
        </StudioStatus>
      )}
    </fieldset>
  );
}
