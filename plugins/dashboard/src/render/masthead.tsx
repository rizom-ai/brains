/** @jsxImportSource react */
import { OperatorMasthead } from "@brains/operator-view-react";
import type { JSX } from "react";

export function Masthead(props: {
  title: string;
  tagline: string | undefined;
}): JSX.Element {
  return (
    <OperatorMasthead
      className="masthead"
      title={props.title}
      description={props.tagline}
    />
  );
}
