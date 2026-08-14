/**
 * Type for the text import of `git-wrapper.sh`.
 *
 * A sibling declaration rather than an ambient `*.sh` wildcard: it resolves
 * relative to the importing file, so every package that typechecks this source
 * sees it without needing a shared ambient type or a triple-slash reference.
 */
declare const wrapperSource: string;
export default wrapperSource;
