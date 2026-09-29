/** @jsxImportSource react */
import { useEffect, useMemo, type Dispatch, type ReactElement } from "react";
import { useQueries } from "@tanstack/react-query";
import { Button } from "@brains/app-ui-react";
import { groupingKeySchema } from "@brains/plugins";
import { isRecord } from "@brains/utils/is-record";
import { MAX_GROUPING_DEFINITIONS } from "../../src/grouping-definitions-contract";
import type { TypeSchema } from "./api";
import type {
  EditorWorkflowAction,
  EditorWorkflowState,
} from "./editor-workflow";
import {
  groupingUsageQueryOptions,
  isGroupingsInitializing,
} from "./grouping-queries";
import { StudioStatus } from "./studio-status";
import { useStudioApi } from "./studio-api-context";
import { StudioGroupingDefinitionsEditor } from "./studio-grouping-definitions-editor";

/** Connect the compound field to ordinary source, draft, save and conflict state. */
export function StudioGroupingDefinitionsField(props: {
  editor: EditorWorkflowState;
  schema: NonNullable<TypeSchema["groupingDefinitions"]>;
  readOnly: boolean;
  dispatch: Dispatch<EditorWorkflowAction>;
}): ReactElement {
  const { editor, schema, dispatch } = props;
  const value = editor.draft["groupings"];
  const saved =
    editor.mode.kind === "edit"
      ? editor.mode.entity.frontmatter["groupings"]
      : undefined;
  const savedKeys = isRecord(saved) ? Object.keys(saved) : [];
  const storedIssues = schema.issues.filter((issue) => {
    const key = issue.path[1];
    if (typeof key === "string" && isRecord(value) && isRecord(saved))
      return (
        Object.hasOwn(value, key) &&
        JSON.stringify(value[key]) === JSON.stringify(saved[key])
      );
    return JSON.stringify(value) === JSON.stringify(saved);
  });
  const sourceInvalid = storedIssues.length > 0;
  useEffect(() => {
    dispatch({
      type: "compoundFieldStateChanged",
      field: "grouping-source",
      invalid: sourceInvalid,
      pendingChanges: false,
    });
  }, [dispatch, sourceInvalid]);
  const api = useStudioApi();
  const requests = useMemo(
    () =>
      (isRecord(saved) ? Object.keys(saved) : [])
        .filter(
          (key) =>
            groupingKeySchema.safeParse(key).success &&
            isRecord(value) &&
            Object.hasOwn(value, key),
        )
        .slice(0, MAX_GROUPING_DEFINITIONS)
        .map((key) => {
          const entry =
            isRecord(value) && isRecord(value[key]) ? value[key] : undefined;
          const values: string[] = Array.isArray(entry?.["values"])
            ? entry["values"].filter(
                (item: unknown): item is string => typeof item === "string",
              )
            : [];
          return { key, values };
        }),
    [value, saved],
  );
  const queries = useMemo(
    () =>
      requests.map(({ key, values }) =>
        groupingUsageQueryOptions(api, key, values),
      ),
    [api, requests],
  );
  const results = useQueries({ queries });
  // Never turn unavailable usage (including a failed refresh) into a zero count.
  const usage = Object.fromEntries(
    requests.flatMap(({ key }, index) => {
      const result = results[index];
      return result?.isSuccess && !result.isFetching
        ? [[key, result.data]]
        : [];
    }),
  );
  const loading = results.some((result) => result.isFetching);
  const initializing = results.some((result) =>
    isGroupingsInitializing(result.failureReason),
  );
  const failed = results.filter(
    (result) => result.isError && !result.isFetching,
  );
  return (
    <>
      {loading && (
        <StudioStatus>
          <span role="status">
            {initializing
              ? "Groupings are initializing. Usage will load when ready."
              : "Loading grouping usage…"}
          </span>
        </StudioStatus>
      )}
      {failed.length > 0 && (
        <StudioStatus tone="error">
          Some grouping usage is unavailable. Counts are not assumed to be zero.{" "}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              for (const result of failed) void result.refetch();
            }}
          >
            Retry usage
          </Button>
        </StudioStatus>
      )}
      <StudioGroupingDefinitionsEditor
        value={value}
        savedKeys={savedKeys}
        contributorTypes={schema.contributorTypes}
        systemTypes={schema.systemTypes}
        readOnly={props.readOnly}
        usage={usage}
        issues={storedIssues}
        onChange={(raw) =>
          dispatch({
            type: "fieldChanged",
            descriptor: {
              name: "groupings",
              label: "Groupings",
              widget: "object",
            },
            raw,
          })
        }
        onStateChange={(state) =>
          dispatch({
            type: "compoundFieldStateChanged",
            field: "groupings",
            pendingChanges: state.pendingChanges,
            invalid: state.issues.length > 0,
          })
        }
      />
    </>
  );
}
