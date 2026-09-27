/** @jsxImportSource react */
/**
 * Historical design-review generator; never imported by Studio.
 * Approved HTML is frozen. Reproduction requires the review-era components
 * and UI assets; running against current sources constitutes a new review.
 */
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement, ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import {
  Button,
  Input,
  NativeSelect,
  ConfirmDialog,
} from "@brains/app-ui-react";
import {
  CONSOLE_FONTS_URL,
  CONSOLE_THEME_CSS,
  resolveConsoleThemeCSS,
} from "@brains/console-theme";
import { StudioPageHead } from "../ui-react/src/studio-page-head";
import { StudioStatus } from "../ui-react/src/studio-status";
import { StudioVocabularyEditor } from "../ui-react/src/studio-vocabulary-editor";
import { Field } from "../ui-react/src/entity-fields";
import { fieldStyles as f } from "../ui-react/src/studio-fields.styles";
import { vocabularyStyles as v } from "../ui-react/src/grouping-vocabulary.styles";
import { studioAssetManifestSchema } from "../src/ui-assets";
import type { GroupingDefinition } from "../src/grouping-definitions-contract";

const noop = (): void => {};
const definitions: Record<string, GroupingDefinition> = {
  clients: {
    label: "Clients",
    types: ["note", "post"],
    multiple: false,
    values: ["Acme", "Beta", "Ka21"],
  },
  projects: {
    label: "Projects",
    types: ["note", "post"],
    multiple: true,
    values: ["Launch", "Rebrand"],
  },
  areas: { label: "Areas", types: ["note"], multiple: false },
};
const usages: Record<string, number> = {
  Acme: 12,
  Beta: 7,
  Ka21: 1,
  Launch: 18,
  Rebrand: 6,
};
const currentGroups = Object.entries(definitions).map(([key, definition]) => ({
  key,
  field: key,
  label: definition.label,
  types: definition.types,
}));
const currentVocabulary = Object.fromEntries(
  Object.entries(definitions).flatMap(([key, definition]) =>
    definition.values
      ? [[key, { multiple: definition.multiple, values: definition.values }]]
      : [],
  ),
);
const adminStates = {
  first: "First visit",
  defined: "Defined",
  adding: "Add grouping",
  empty: "Empty closed list",
  remove: "Remove grouping",
  dropped: "Invalid stored entry",
  reader: "Trusted reader",
};
const editorStates = {
  editor: "Editing a Note",
  stray: "Out-of-list value",
  refused: "Refused save",
};

function Head({
  title,
  meta,
  children,
}: {
  title: string;
  meta: string;
  children?: ReactNode;
}): ReactElement {
  return (
    <StudioPageHead
      model={{
        title,
        access: { kind: "permission", label: "Admin only" },
        metadata: [meta],
        totals: [],
      }}
      navigation={
        <span className="crumb">
          {title === "Groupings" ? "System / Structure" : "Library / Notes"}
        </span>
      }
      action={children}
    />
  );
}
function StaticValue({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}): ReactElement {
  return (
    <div {...stylex.props(f.field)}>
      <span {...stylex.props(f.label)}>{label}</span>
      <div className="static-value">{children}</div>
    </div>
  );
}
function DefinitionSection({
  name,
  definition,
  readOnly = false,
  adding = false,
}: {
  name: string;
  definition: GroupingDefinition;
  readOnly?: boolean;
  adding?: boolean;
}): ReactElement {
  const values = definition.values;
  return (
    <section
      {...stylex.props(v.section)}
      aria-label={adding ? "New grouping" : definition.label}
    >
      <div {...stylex.props(v.head)}>
        <h2 {...stylex.props(v.title)}>
          {adding ? "New grouping" : definition.label}
        </h2>
        {!readOnly && (
          <Button
            variant="ghost"
            data-review-state={name === "clients" ? "remove" : undefined}
            aria-label={`Remove ${definition.label} grouping`}
          >
            Remove grouping
          </Button>
        )}
      </div>
      <div className="definition-grid">
        {readOnly ? (
          <StaticValue label="Label">{definition.label}</StaticValue>
        ) : (
          <Field
            descriptor={{
              name: `${name}-label`,
              label: "Label",
              widget: "string",
            }}
            value={definition.label}
            onChange={noop}
          />
        )}
        {adding ? (
          <>
            <Field
              descriptor={{
                name: `${name}-key`,
                label: "Key",
                widget: "string",
              }}
              value={name}
              onChange={noop}
            />
          </>
        ) : (
          <StaticValue label="Key">
            <code>{name}</code>
            <span className="key-note">Fixed after creation</span>
          </StaticValue>
        )}
        <fieldset className="type-choices">
          <legend {...stylex.props(f.label)}>Applies to</legend>
          {["note", "post"].map((type) => (
            <label key={type} {...stylex.props(v.choice)}>
              <input
                type="checkbox"
                checked={definition.types.includes(type)}
                readOnly
                disabled={readOnly}
                {...stylex.props(v.checkbox)}
              />
              {type === "note" ? "Notes" : "Posts"}
            </label>
          ))}
          {definition.types
            .filter((type) => !["note", "post"].includes(type))
            .map((type) => (
              <label key={type} {...stylex.props(v.choice)}>
                <input
                  type="checkbox"
                  checked
                  readOnly
                  disabled={readOnly}
                  {...stylex.props(v.checkbox)}
                />
                {type} (unavailable)
              </label>
            ))}
        </fieldset>
        <label {...stylex.props(f.field)}>
          <span {...stylex.props(f.label)}>Values per entry</span>
          {readOnly ? (
            <span {...stylex.props(f.readOnly)}>
              {definition.multiple ? "Several" : "One"}
            </span>
          ) : (
            <NativeSelect
              aria-label={`${definition.label}: values per entry`}
              value={definition.multiple ? "several" : "one"}
              onChange={noop}
            >
              <option value="one">One</option>
              <option value="several">Several</option>
            </NativeSelect>
          )}
        </label>
      </div>
      {adding && (
        <p {...stylex.props(f.listHelp)}>
          Use lowercase letters, digits and hyphens for the key. It becomes
          fixed when saved.
        </p>
      )}
      <fieldset className="value-rule">
        <legend {...stylex.props(f.label)}>Allowed values</legend>
        {[
          [false, "Any value"],
          [true, "Only these values"],
        ].map(([closed, label]) => (
          <label key={String(closed)} {...stylex.props(v.choice)}>
            <input
              type="radio"
              name={`${name}-rule`}
              checked={(values !== undefined) === closed}
              readOnly
              disabled={readOnly}
              {...stylex.props(v.checkbox)}
            />
            {label}
          </label>
        ))}
      </fieldset>
      {values && (
        <>
          <div className="membership-frame">
            <div
              {...stylex.props(f.tags)}
              aria-label={`${definition.label} allowed values`}
            >
              {values.map((value) => (
                <span key={value} {...stylex.props(f.tag)}>
                  {value}
                  <span
                    className="usage"
                    aria-label={`${usages[value] ?? 0} entries`}
                  >
                    {usages[value] ?? 0}
                  </span>
                  {!readOnly && (
                    <button
                      type="button"
                      {...stylex.props(f.tagButton)}
                      aria-label={`Remove ${value} from allowed values`}
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
            </div>
          </div>
          {!readOnly && (
            <div className="literal-add">
              <Input
                aria-label={`New ${definition.label} value`}
                placeholder="Add an exact value…"
              />
              <Button variant="outline">Add value</Button>
            </div>
          )}
          <p {...stylex.props(f.listHelp)}>
            {values.length
              ? "Numbers show current usage. Unused values remain available."
              : "Add at least one allowed value, or choose Any value."}
          </p>
        </>
      )}
    </section>
  );
}
function Admin({
  state,
  proposed,
}: {
  state: string;
  proposed: boolean;
}): ReactElement {
  const reader = state === "reader";
  const first = state === "first";
  const empty = state === "empty";
  const invalid = state === "dropped";
  const adding = state === "adding";
  const pristine = first || state === "defined" || reader;
  return (
    <>
      <Head
        title="Groupings"
        meta={reader ? "Shared · Read only" : "Shared · Admin only"}
      >
        {!reader && (
          <Button
            variant="primary"
            disabled={proposed ? pristine || empty || invalid : !first}
            data-prototype-action="save"
          >
            Save
          </Button>
        )}
      </Head>
      <div className="sheet">
        {!proposed ? (
          <>
            <StudioStatus>
              Existence, labels and participating types are operator-configured.
              This editor changes lists and cardinality only.
            </StudioStatus>
            <StudioVocabularyEditor
              groupings={first ? [] : currentGroups}
              value={first ? {} : currentVocabulary}
              readOnly={reader}
              onChange={noop}
            />
          </>
        ) : (
          <>
            <p className="rules">
              Groups collect entries by exact frontmatter values. Removing a
              grouping or a listed value never rewrites entries. Values outside
              a list stay visible until an editor changes them.
            </p>
            {reader && (
              <StudioStatus>
                You can use these groupings. Only administrators can change
                their definitions.
              </StudioStatus>
            )}
            {first ? (
              <section className="first-visit">
                <span className="folio">01 / Structure</span>
                <h2>Your first grouping</h2>
                <p>
                  Bring related Notes and Posts together without moving them.
                  Define a label, its types, and whether editors choose one
                  value or several.
                </p>
                <Button variant="outline" data-review-state="adding">
                  Add grouping
                </Button>
                <StudioStatus>No unsaved changes.</StudioStatus>
              </section>
            ) : (
              <>
                {invalid && (
                  <StudioStatus tone="error">
                    One stored definition is inactive: Clients refers to
                    unavailable type “customer-note”. Its source has not been
                    discarded. Select an available type or remove the definition
                    to repair it.
                  </StudioStatus>
                )}
                {Object.entries(definitions)
                  .filter(([key]) => state !== "remove" || key === "clients")
                  .map(([key, definition]) => (
                    <DefinitionSection
                      key={key}
                      name={key}
                      definition={
                        empty && key === "clients"
                          ? { ...definition, values: [] }
                          : invalid && key === "clients"
                            ? { ...definition, types: ["customer-note"] }
                            : definition
                      }
                      readOnly={reader}
                    />
                  ))}
                {adding && (
                  <DefinitionSection
                    name="topics"
                    definition={{
                      label: "Topics",
                      types: ["note"],
                      multiple: true,
                    }}
                    adding
                  />
                )}
                {!reader && (
                  <div className="add-definition">
                    <Button variant="outline" data-review-state="adding">
                      Add grouping
                    </Button>
                    <span {...stylex.props(f.kind)}>{adding ? 4 : 3} / 20</span>
                  </div>
                )}
              </>
            )}
            {!reader && (
              <div className="save-line">
                <StudioStatus>
                  {empty
                    ? "Cannot save: Clients needs at least one allowed value."
                    : invalid
                      ? "Cannot save: repair the inactive Clients definition first."
                      : pristine
                        ? "No unsaved changes."
                        : "Unsaved changes"}
                </StudioStatus>
                <Button
                  variant="primary"
                  disabled={pristine || empty || invalid}
                  data-prototype-action="save"
                >
                  Save
                </Button>
              </div>
            )}
          </>
        )}
      </div>
      {proposed && state === "remove" && (
        <ConfirmDialog
          mark="−"
          title="Remove Clients grouping?"
          titleId="remove-clients"
          cancelLabel="Keep grouping"
          confirmLabel="Remove grouping"
          confirmVariant="danger"
          onCancel={noop}
          onConfirm={noop}
        >
          <p>
            20 entries will keep their Clients values. The grouping disappears
            from browsing and editing after you save.
          </p>
          <p>
            Re-adding the same key can collect those values again. No entries
            are deleted or moved.
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}
function ProposedMembership({
  name,
  label,
  multiple,
  values,
  allowed,
  error,
}: {
  name: string;
  label: string;
  multiple: boolean;
  values: string[];
  allowed?: string[] | undefined;
  error?: string;
}): ReactElement {
  return (
    <section
      {...stylex.props(f.field)}
      aria-label={label}
      data-proposed-group={name}
    >
      <div {...stylex.props(f.label)}>
        <span>{label}</span>
        <em {...stylex.props(f.kind)}>{multiple ? "several" : "one"}</em>
      </div>
      <div className="membership-frame">
        <div {...stylex.props(f.tags)}>
          {values.map((value) => (
            <span key={value} {...stylex.props(f.tag)}>
              <span>{value}</span>
              {allowed && !allowed.includes(value) && (
                <span {...stylex.props(v.marker)}>not in list</span>
              )}
              <button
                {...stylex.props(f.tagButton)}
                aria-label={`Remove ${value} from ${label}`}
              >
                ×
              </button>
            </span>
          ))}
          {allowed ? (
            <NativeSelect
              aria-label={`${multiple || !values.length ? "Add" : "Replace"} ${label} value`}
              defaultValue=""
              className="choose-value"
            >
              <option value="" disabled>
                {multiple || !values.length
                  ? "Choose value…"
                  : "Replace value…"}
              </option>
              {allowed
                .filter((value) => !values.includes(value))
                .map((value) => (
                  <option key={value}>{value}</option>
                ))}
            </NativeSelect>
          ) : (
            <div className="open-slot">
              <input
                aria-label={`${label} value`}
                placeholder={multiple ? "Add a value…" : "Replace value…"}
                {...stylex.props(f.tagInput, f.literalInput)}
              />
              <Button size="sm" variant="ghost">
                {multiple ? "Add" : "Replace"}
              </Button>
            </div>
          )}
        </div>
      </div>
      {!allowed && (
        <div className="open-help">
          <small>
            {multiple
              ? "Type an exact value, or choose a suggestion."
              : "A new value replaces the current choice."}
          </small>
          <Button size="sm" variant="ghost">
            Suggest
          </Button>
        </div>
      )}
      {!allowed && (
        <div className="suggestions">
          <span {...stylex.props(f.kind)}>From your entries</span>
          <Button size="xs" variant="outline">
            {name === "areas" ? "Practice" : "Community"}
          </Button>
        </div>
      )}
      {error && (
        <StudioStatus tone="error">
          Last save: {error} Your draft is still here.
        </StudioStatus>
      )}
    </section>
  );
}
function Editor({
  state,
  proposed,
}: {
  state: string;
  proposed: boolean;
}): ReactElement {
  const stray = state !== "editor";
  const clients = [stray ? "Former partner" : "Acme"];
  return (
    <>
      <Head title="Field notes" meta="Note · Unsaved changes">
        <Button variant="primary" data-prototype-action="save">
          Save
        </Button>
      </Head>
      <div className="note-layout">
        <aside className="properties">
          <h2 className="properties-title">Properties</h2>
          {proposed ? (
            <>
              <ProposedMembership
                name="clients"
                label="Clients"
                multiple={false}
                values={clients}
                allowed={definitions["clients"]?.values}
                {...(state === "refused"
                  ? {
                      error:
                        "Clients: choose a value from the configured list.",
                    }
                  : {})}
              />
              <ProposedMembership
                name="projects"
                label="Projects"
                multiple
                values={["Launch"]}
                allowed={definitions["projects"]?.values}
              />
              <ProposedMembership
                name="areas"
                label="Areas"
                multiple={false}
                values={["Research"]}
              />
              <ProposedMembership
                name="topics"
                label="Topics"
                multiple
                values={["Field work"]}
              />
            </>
          ) : (
            <>
              {[
                [
                  "clients",
                  "Clients",
                  clients,
                  { multiple: false, values: ["Acme", "Beta", "Ka21"] },
                ],
                [
                  "projects",
                  "Projects",
                  ["Launch"],
                  { multiple: true, values: ["Launch", "Rebrand"] },
                ],
              ].map(([name, label, value, vocabulary]) => (
                <Field
                  key={String(name)}
                  descriptor={{
                    name: String(name),
                    label: String(label),
                    widget: "list",
                    required: false,
                  }}
                  value={value}
                  vocabulary={
                    typeof vocabulary === "object" && !Array.isArray(vocabulary)
                      ? vocabulary
                      : undefined
                  }
                  onChange={noop}
                  {...(state === "refused" && name === "clients"
                    ? {
                        issues: [
                          {
                            path: ["clients"],
                            message:
                              "Clients: choose values from the configured list.",
                          },
                        ],
                      }
                    : {})}
                />
              ))}
              <Field
                literalList
                descriptor={{
                  name: "areas",
                  label: "Areas",
                  widget: "list",
                  required: false,
                }}
                value={["Research"]}
                onChange={noop}
              />
              <Field
                literalList
                descriptor={{
                  name: "topics",
                  label: "Topics",
                  widget: "list",
                  required: false,
                }}
                value={["Field work"]}
                onChange={noop}
              />
              <StudioStatus>
                The current open control has no independent one-value rule.
              </StudioStatus>
            </>
          )}
        </aside>
        <article className="manuscript">
          <span className="folio">Note / manuscript</span>
          <h2>Small groups, lasting context</h2>
          <p>
            A field note can belong to a client, a project and an area without
            changing its identity or its place in the library.
          </p>
          <p>
            Keep the language people already use. A name is not a folder, and a
            grouping is not a reason to move a document.
          </p>
          <p className="draft-line">
            This paragraph is an unsaved draft and stays here if validation
            refuses the save.
          </p>
        </article>
      </div>
    </>
  );
}

const manifest = studioAssetManifestSchema.parse(
  await Bun.file(
    new URL("../dist/ui/studio-asset-manifest.json", import.meta.url),
  ).json(),
);
const css = await Bun.file(
  new URL(`../dist/ui/${manifest.entrypoints.stylesheet}`, import.meta.url),
).text();
const layout = `
*{box-sizing:border-box;margin:0;padding:0}body{margin:0;background:var(--console-bg);color:var(--console-text);font:14px/1.55 var(--console-ui)}button,input,select{font:inherit}button{cursor:pointer}a{color:var(--console-accent)}
.review{padding:22px 28px;border-bottom:1px solid var(--console-rule-strong);background:var(--console-card)}.review h1{font:500 27px var(--console-display);margin:3px 0 10px}.review p{font-size:12px;color:var(--console-text-dim);max-width:86ch}.tools{display:flex;gap:16px;align-items:center;flex-wrap:wrap}.tools label{display:grid;gap:4px;font:11px var(--console-mono)}.tools select{min-height:36px;padding:6px;background:var(--console-card);color:var(--console-text);border:1px solid var(--console-rule-strong);border-radius:6px}.review-links{margin-left:auto;display:flex;gap:16px}
#panels{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:26px;padding:26px;align-items:start}#panels[data-view=proposed],#panels[data-view=today]{grid-template-columns:minmax(0,1060px);justify-content:center}.panel{min-width:0}.version{font:11px var(--console-mono);color:var(--console-text-dim);padding:0 0 10px}.screen{background:var(--console-card);border:1px solid var(--console-rule-strong);border-radius:10px;overflow:hidden;min-width:0}.screen>.studio-page-head{padding:26px 28px 18px}.crumb{font:11px var(--console-mono);color:var(--console-text-muted)}.sheet{padding:24px 28px 28px}.rules{margin:0 0 24px;color:var(--console-text-dim);font-size:13px;max-width:78ch}.definition-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px 24px;margin:18px 0}.static-value{min-height:38px;display:flex;align-items:center;flex-wrap:wrap;padding:8px 10px;border:1px dashed var(--console-rule-strong);border-radius:6px;background:var(--console-card-soft);font:12px var(--console-mono)}.key-note{font-size:10px;color:var(--console-text-muted);margin-left:12px}.type-choices,.value-rule{border:0;padding:0;margin:0;min-width:0}.value-rule{display:flex;gap:18px;flex-wrap:wrap;margin-bottom:12px}.value-rule legend{margin-bottom:4px}.literal-add{display:flex;gap:8px;margin-top:12px}.literal-add input{max-width:320px}.usage{font:10px var(--console-mono);border-left:1px solid var(--console-rule-strong);padding-left:6px;margin-left:4px}.add-definition,.save-line{display:flex;justify-content:space-between;align-items:center;gap:20px}.save-line{margin-top:26px;border-top:1px solid var(--console-rule-strong);padding-top:18px}.first-visit{padding:38px 0 50px;max-width:52ch}.first-visit h2{font:500 30px var(--console-display)}.folio{font:10px var(--console-mono);text-transform:uppercase;letter-spacing:.12em;color:var(--console-accent)}.first-visit p{color:var(--console-text-dim)}
.note-layout{display:grid;grid-template-columns:minmax(240px,.9fr) minmax(0,1.1fr);gap:28px;padding:24px 28px 32px}.properties{min-width:0}.properties-title{font:11px var(--console-mono);text-transform:uppercase;letter-spacing:.1em;margin:0 0 18px;color:var(--console-text-muted)}.membership-frame{border:1px solid var(--console-rule-strong);border-radius:8px;padding:9px;background:var(--console-card-soft)}.membership-frame .choose-value{flex:1;width:auto;min-width:120px;max-width:100%;min-height:32px;font-size:12px;background-color:transparent;border-width:0;color:var(--console-text-dim)}.open-slot{display:inline-flex;gap:4px;align-items:center;min-width:0;max-width:100%}.open-help{display:flex;justify-content:space-between;gap:8px;align-items:baseline;color:var(--console-text-muted)}.suggestions{display:flex;gap:8px;align-items:center;margin-top:6px}.manuscript{border-left:1px solid var(--console-rule-strong);padding-left:26px;min-width:0;font:17px/1.8 var(--console-display)}.manuscript h2{font-size:29px;line-height:1.18;font-weight:500;margin:20px 0}.manuscript p{margin-bottom:1em}.draft-line{color:var(--console-text-dim)}
[data-view=compare] .note-layout{grid-template-columns:minmax(0,1fr)}[data-view=compare] .manuscript{border-left:0;border-top:1px solid var(--console-rule-strong);padding:22px 0 0}.notice{font:11px var(--console-mono);color:var(--console-text-dim);padding:0 28px 24px}template{display:none}
@media(max-width:700px){.review{padding:18px}.review-links{margin-left:0}#panels{display:block;padding:18px}.panel+.panel{margin-top:26px}.screen>.studio-page-head{padding:22px 18px 16px}.sheet{padding:20px 18px 22px}.definition-grid{grid-template-columns:minmax(0,1fr);gap:14px}.literal-add{flex-wrap:wrap}.literal-add input{flex:1;min-width:150px}.note-layout{display:block;padding:20px 18px 24px}.membership-frame .choose-value{font-size:16px}.manuscript{margin-top:30px;padding:22px 0 0;border-left:0;border-top:1px solid var(--console-rule-strong)}.open-help{align-items:center}.value-rule{gap:8px 20px}.notice{padding:0 18px 22px}.save-line{align-items:flex-start}.save-line p{margin-top:0}}
`;
for (const [kind, states] of [
  ["definitions", adminStates],
  ["editor", editorStates],
] as const) {
  const templates = Object.entries(states)
    .map(
      ([state]) =>
        `<template id="state-${state}">${[false, true].map((proposed) => `<section class="panel" data-version="${proposed ? "proposed" : "today"}"><div class="version">${proposed ? "PROPOSED / definitions document" : "CURRENT WORKTREE / vocabulary controls"}</div><div class="screen">${renderToStaticMarkup(kind === "definitions" ? <Admin state={state} proposed={proposed} /> : <Editor state={state} proposed={proposed} />, { identifierPrefix: `${kind}-${state}-${proposed ? "new" : "old"}-` })}</div></section>`).join("")}</template>`,
    )
    .join("\n");
  const html = `<!doctype html><html lang="en" data-climate="paper"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Studio ${kind} — design review</title><link rel="stylesheet" href="${CONSOLE_FONTS_URL}"><style>${resolveConsoleThemeCSS(undefined, { imports: "remove" })}\n${CONSOLE_THEME_CSS}\n${css}\n${layout}</style></head><body><header class="review"><span class="folio">Studio / design review</span><h1>${kind === "definitions" ? "Define the groups. Keep the entries." : "One frame for every grouping."}</h1><p>Real Studio components: Field, Button, Input, NativeSelect, PageHead, Status and ConfirmDialog. Proposed composition only; not a live app. Today includes the three uncommitted control fixes. Counts and content are illustrative. Nothing is saved, synced or deployed.</p><div class="tools"><label>State<select id="state">${Object.entries(
    states,
  )
    .map(([key, label]) => `<option value="${key}">${label}</option>`)
    .join(
      "",
    )}</select></label><label>View<select id="view"><option value="compare">Side by side</option><option value="proposed">Proposed only</option><option value="today">Current only</option></select></label><label>Climate<select id="climate"><option value="paper">Paper</option><option value="instrument">Instrument</option></select></label><div class="review-links"><a href="studio-grouping-definitions-mockups.html">Definitions</a><a href="studio-grouping-editor-mockups.html">Note controls</a></div></div></header><main id="panels"></main><footer class="notice" id="feedback">Static review: input changes are local to this page. The new editor is not implemented yet.</footer>${templates}<script>
const params=new URLSearchParams(location.search);const states=${JSON.stringify(Object.keys(states))};const state=document.getElementById('state'),view=document.getElementById('view'),climate=document.getElementById('climate');state.value=states.includes(params.get('state'))?params.get('state'):states[${kind === "definitions" ? 1 : 0}];view.value=['today','proposed','compare'].includes(params.get('view'))?params.get('view'):'compare';climate.value=params.get('climate')==='instrument'?'instrument':'paper';
function paint(){document.documentElement.dataset.climate=climate.value;document.documentElement.dataset.theme=climate.value==='instrument'?'dark':'light';const panels=document.getElementById('panels');const mode=state.value==='remove'?'proposed':view.value;panels.dataset.view=mode;panels.replaceChildren(document.getElementById('state-'+state.value).content.cloneNode(true));panels.querySelectorAll('.panel').forEach(node=>{if(mode!=='compare'&&node.dataset.version!==mode)node.remove()});const p=new URLSearchParams({state:state.value,view:view.value,climate:climate.value});history.replaceState(null,'','?'+p);}
for(const control of [state,view,climate])control.addEventListener('change',paint);document.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;if(button.dataset.reviewState){state.value=button.dataset.reviewState;paint();}else if(button.textContent==='Keep grouping'||button.textContent==='Remove grouping'&&state.value==='remove'){state.value='defined';paint();}else{document.getElementById('feedback').textContent='Design preview only — this action does not save or change any data.';}});document.addEventListener('keydown',event=>{if(event.key==='Escape'&&state.value==='remove'){state.value='defined';paint();}});paint();
</script></body></html>`;
  await Bun.write(
    new URL(
      `../../../docs/studio-grouping-${kind}-mockups.html`,
      import.meta.url,
    ),
    html,
  );
}
console.log(
  "Generated definition and editor mockups from current Studio components.",
);
