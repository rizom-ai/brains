import { readFileSync } from "node:fs";
import { transformSync } from "@babel/core";
import stylexPlugin, { type Rule as StylexRule } from "@stylexjs/babel-plugin";

declare module "@babel/core" {
  interface BabelFileMetadata {
    stylex?: unknown;
  }
}

export interface StylexTransformResult {
  code: string;
  rules: StylexRule[];
}

export interface StylexBunTransform {
  plugin: Bun.BunPlugin;
  css: () => string;
}

export interface StylexBunTransformOptions {
  filter?: RegExp | undefined;
}

function loaderFor(path: string): Bun.Loader {
  if (path.endsWith(".tsx")) return "tsx";
  if (path.endsWith(".ts")) return "ts";
  if (path.endsWith(".jsx")) return "jsx";
  return "js";
}

function isStylexRule(value: unknown): value is StylexRule {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    typeof value[0] === "string" &&
    typeof value[1] === "object" &&
    value[1] !== null &&
    typeof value[2] === "number"
  );
}

export function transformStylexSource(
  source: string,
  filename: string,
): StylexTransformResult {
  const transformed = transformSync(source, {
    filename,
    babelrc: false,
    configFile: false,
    sourceMaps: false,
    parserOpts: {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
    },
    plugins: [
      [
        stylexPlugin,
        {
          dev: false,
          runtimeInjection: false,
          treeshakeCompensation: true,
        },
      ],
    ],
  });
  const code = transformed?.code;
  if (!code) throw new Error(`StyleX produced no output for ${filename}`);
  const metadata = transformed.metadata?.stylex;
  const rules = Array.isArray(metadata) ? metadata.filter(isStylexRule) : [];
  return { code, rules };
}

/**
 * Compile StyleX calls during a Bun browser build and collect their static CSS.
 * The returned stylesheet contains no runtime injector or Babel dependency.
 */
export function createStylexBunTransform(
  options: StylexBunTransformOptions = {},
): StylexBunTransform {
  const rules: StylexRule[] = [];
  return {
    plugin: {
      name: "compile-stylex",
      setup(build): void {
        build.onLoad(
          { filter: options.filter ?? /\.[cm]?[jt]sx?$/ },
          (args) => {
            const source = readFileSync(args.path, "utf8");
            if (!source.includes("@stylexjs/stylex")) return undefined;
            const transformed = transformStylexSource(source, args.path);
            rules.push(...transformed.rules);
            return {
              contents: transformed.code,
              loader: loaderFor(args.path),
            };
          },
        );
      },
    },
    css: () => stylexPlugin.processStylexRules(rules),
  };
}
