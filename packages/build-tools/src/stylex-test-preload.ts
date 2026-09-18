import { createStylexBunTransform } from "./stylex-bun-plugin";

// Shared components and Studio use StyleX declarations. Production bundles run
// this transform in their build scripts; source-based tests use the same
// compile-only loader so they receive static class names without an injector.
//
// Test scripts that load this preload run with BUN_JSC_useDFGJIT=0. Under Bun
// 1.4's optimising JIT tier the css tokenizer inside @stylexjs/babel-plugin
// starts mis-reading end-of-input after a few dozen media-query parses, and
// every later compile in the process fails with "Invalid media query syntax".
// JSC options are read at process start, so the flag lives in the scripts
// rather than here. See KNOWN-ISSUES.md.
await Bun.plugin(
  createStylexBunTransform({
    filter:
      /[/\\](?:shared[/\\]app-ui-react[/\\]src[/\\](?:controls|interactive)\.tsx|shared[/\\]operator-view-react[/\\]src[/\\][^/\\]+\.styles\.ts|plugins[/\\]studio[/\\]ui-react[/\\]src[/\\][^/\\]+\.styles\.ts)$/,
  }).plugin,
);
