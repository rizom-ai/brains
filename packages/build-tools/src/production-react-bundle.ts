const DEVELOPMENT_JSX_RUNTIME = "react/jsx-dev-runtime";

/**
 * Canonical JSX transform for published React bundles.
 *
 * Published artifacts must not inherit the build process environment: a
 * development transform emits jsxDEV calls that React intentionally does not
 * provide when consumers run with NODE_ENV=production.
 */
export const productionReactJsx = {
  runtime: "automatic",
  importSource: "react",
  development: false,
} as const;

/** Fail closed before publishing a React bundle compiled with jsxDEV. */
export function assertProductionReactBundle(
  source: string,
  artifactPath: string,
): void {
  if (!source.includes(DEVELOPMENT_JSX_RUNTIME)) {
    return;
  }

  throw new Error(
    `${artifactPath} imports ${DEVELOPMENT_JSX_RUNTIME}; build published React artifacts with productionReactJsx`,
  );
}
