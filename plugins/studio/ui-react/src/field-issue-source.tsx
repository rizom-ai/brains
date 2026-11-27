/** @jsxImportSource react */
import {
  createContext,
  useContext,
  type ReactElement,
  type ReactNode,
} from "react";

/**
 * Where a field's issues came from: a save the server refused, or the check a
 * new entry runs while it is written. Only the first is a "last save".
 */
export type FieldIssueOrigin = "save" | "check";

const FieldIssueOriginContext = createContext<FieldIssueOrigin>("save");

export function FieldIssueSource(props: {
  value: FieldIssueOrigin;
  children: ReactNode;
}): ReactElement {
  return (
    <FieldIssueOriginContext.Provider value={props.value}>
      {props.children}
    </FieldIssueOriginContext.Provider>
  );
}

export function useFieldIssueOrigin(): FieldIssueOrigin {
  return useContext(FieldIssueOriginContext);
}
