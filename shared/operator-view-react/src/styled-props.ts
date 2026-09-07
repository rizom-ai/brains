import * as stylex from "@stylexjs/stylex";
import type {
  CompiledStyles,
  InlineStyles,
  StyleXArray,
} from "@stylexjs/stylex";

/** What `stylex.props()` accepts: compiled styles, conditionals, and nesting. */
type StylexStyleArgument = StyleXArray<
  | null
  | undefined
  | boolean
  | CompiledStyles
  | Readonly<[CompiledStyles, InlineStyles]>
>;
type StylexStyleArguments = ReadonlyArray<StylexStyleArgument>;
type StylexAttributes = ReturnType<typeof stylex.props>;

/**
 * Merge compiled stylex attributes into element props.
 *
 * The host's className comes first so host stylesheets can still target the
 * element; the compiled classes follow. The rest of the stylex output (inline
 * style, source marker) wins over the matching prop, as spreading
 * `stylex.props()` last always did.
 */
export function styledProps<P extends { className?: string | undefined }>(
  props: P,
  ...styles: StylexStyleArguments
): P & StylexAttributes {
  const css = stylex.props(...styles);
  return {
    ...props,
    ...css,
    className: [props.className, css.className].filter(Boolean).join(" "),
  };
}
