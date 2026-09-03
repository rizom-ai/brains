import { createStylexBunTransform } from "./stylex-bun-plugin";

// App controls are authored as StyleX declarations. Production bundles run
// this transform in their build scripts; source-based tests use the same
// compile-only loader so they receive static class names without an injector.
await Bun.plugin(
  createStylexBunTransform({
    filter:
      /[/\\]shared[/\\]app-ui-react[/\\]src[/\\](?:controls|interactive)\.tsx$/,
  }).plugin,
);
