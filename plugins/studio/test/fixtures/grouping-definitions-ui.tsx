/** @jsxImportSource react */
/** Isolated browser review fixture. No API, authentication or app persistence. */
import { createRoot } from "react-dom/client";
import { useState, type ReactElement } from "react";
import { Button } from "@brains/app-ui-react";
import {
  StudioGroupingDefinitionsEditor,
  type GroupingDefinitionEditorState,
} from "../../ui-react/src/studio-grouping-definitions-editor";
import { GroupingMembershipField } from "../../ui-react/src/grouping-membership-field";
import { StudioPageHead } from "../../ui-react/src/studio-page-head";
import type { GroupingDefinition } from "../../src/grouping-definitions-contract";
const params = new URLSearchParams(location.search);
const definitions: Record<string, GroupingDefinition> = {
  clients: {
    label: "Clients",
    multiple: false,
    values: ["Acme", "Beta", "Ka21"],
  },
  projects: {
    label: "Projects",
    multiple: true,
    values: ["Launch", "Rebrand"],
  },
  areas: { label: "Areas", excludeTypes: ["post"], multiple: false },
  topics: { label: "Topics", multiple: true },
};
const initial = Object.fromEntries(
  Object.entries(definitions).filter(([key]) => key !== "topics"),
);
function Review(): ReactElement {
  const editor = params.get("kind") === "editor";
  const reader = params.get("state") === "reader";
  const [saved, setSaved] = useState<Record<string, unknown>>(
    params.get("state") === "first" ? {} : initial,
  );
  const [draft, setDraft] = useState(saved);
  const [validation, setValidation] = useState<GroupingDefinitionEditorState>({
    issues: [],
    pendingChanges: false,
  });
  const [memberships, setMemberships] = useState<Record<string, string[]>>({
    clients: [params.get("state") === "stray" ? "Former partner" : "Acme"],
    projects: ["Launch"],
    areas: ["Research"],
    topics: ["Field work"],
  });
  const dirty =
    validation.pendingChanges ||
    JSON.stringify(draft) !== JSON.stringify(saved);
  const blocked = reader || !dirty || validation.issues.length > 0;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!blocked) setSaved(draft);
      }}
    >
      <StudioPageHead
        model={{
          title: editor ? "Field notes" : "Groupings",
          access: { kind: "permission", label: "Admin only" },
          totals: [],
        }}
        action={
          !reader && !editor ? (
            <Button type="submit" disabled={blocked}>
              Save
            </Button>
          ) : undefined
        }
      />
      <div className="content">
        {editor ? (
          <div className="note-layout">
            <aside>
              {Object.entries(definitions).map(([key, definition]) => (
                <GroupingMembershipField
                  key={key}
                  label={definition.label}
                  definition={definition}
                  value={memberships[key]}
                  onChange={(value) =>
                    setMemberships((previous) => ({
                      ...previous,
                      [key]: value,
                    }))
                  }
                  suggestions={key === "areas" ? ["Practice"] : ["Community"]}
                />
              ))}
            </aside>
            <article>
              <h2>Small groups, lasting context</h2>
              <p>
                A field note can belong to a client, a project and an area
                without changing its identity or its place in the library.
              </p>
              <p>
                Keep the language people already use. A name is not a folder,
                and a grouping is not a reason to move a document.
              </p>
            </article>
          </div>
        ) : (
          <StudioGroupingDefinitionsEditor
            value={draft}
            savedKeys={Object.keys(saved)}
            systemTypes={[]}
            contributorTypes={[
              { entityType: "note", label: "Notes" },
              { entityType: "post", label: "Posts" },
            ]}
            readOnly={reader}
            usage={{
              clients: {
                entries: 20,
                values: [
                  { value: "Acme", count: 12 },
                  { value: "Beta", count: 7 },
                  { value: "Ka21", count: 1 },
                ],
              },
              projects: {
                entries: 20,
                values: [
                  { value: "Launch", count: 18 },
                  { value: "Rebrand", count: 6 },
                ],
              },
            }}
            onChange={setDraft}
            onStateChange={setValidation}
          />
        )}
        <p role="status">
          {reader
            ? "Read only"
            : dirty
              ? "Unsaved changes"
              : "No unsaved changes"}
        </p>
        <output hidden data-review-state="">
          {JSON.stringify({ draft, memberships, validation })}
        </output>
      </div>
    </form>
  );
}
const root = document.getElementById("root");
if (!root) throw new Error("Missing component review mount");
createRoot(root).render(<Review />);
