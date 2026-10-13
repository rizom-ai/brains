import type { SourceActionControl } from "./operator-action-normalization";
import type {
  RuntimeOperatorActionControl,
  RuntimeStudioOperatorView,
  RuntimeStudioOperatorRegionBlock,
} from "./operator-view-runtime-types";

/** Parsed source views share the runtime structure, but retain typed action definitions.
 * Substitute only action controls; collection and container shapes stay declared once.
 */
type WithSourceActions<T> = T extends RuntimeOperatorActionControl
  ? SourceActionControl & Omit<T, keyof RuntimeOperatorActionControl>
  : T extends readonly (infer Item)[]
    ? readonly WithSourceActions<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: WithSourceActions<T[Key]> }
      : T;

export type StudioViewSource = WithSourceActions<RuntimeStudioOperatorView>;
export type StudioBlockSource = StudioViewSource["blocks"][number];
export type StudioRegionSource =
  WithSourceActions<RuntimeStudioOperatorRegionBlock>;
