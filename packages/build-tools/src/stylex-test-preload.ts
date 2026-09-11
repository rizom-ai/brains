import { createStylexBunTransform } from "./stylex-bun-plugin";

// Shared components and Studio use StyleX declarations. Production bundles run
// this transform in their build scripts; source-based tests use the same
// compile-only loader so they receive static class names without an injector.
await Bun.plugin(
  createStylexBunTransform({
    filter:
      /[/\\](?:shared[/\\]app-ui-react[/\\]src[/\\](?:controls|interactive)\.tsx|shared[/\\]operator-view-react[/\\]src[/\\][^/\\]+\.styles\.ts|plugins[/\\]studio[/\\]ui-react[/\\]src[/\\][^/\\]+\.styles\.ts)$/,
  }).plugin,
);
