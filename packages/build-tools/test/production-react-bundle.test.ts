import { describe, expect, test } from "bun:test";
import {
  assertProductionReactBundle,
  productionReactJsx,
} from "../src/production-react-bundle";

describe("production React bundle contract", () => {
  test("defines a deterministic production automatic JSX transform", () => {
    expect(productionReactJsx).toEqual({
      runtime: "automatic",
      importSource: "react",
      development: false,
    });
  });

  test("accepts the production JSX runtime", () => {
    expect(() =>
      assertProductionReactBundle(
        'import { jsx } from "react/jsx-runtime";',
        "dist/index.js",
      ),
    ).not.toThrow();
  });

  test("rejects the development JSX runtime", () => {
    expect(() =>
      assertProductionReactBundle(
        'import { jsxDEV } from "react/jsx-dev-runtime";',
        "dist/index.js",
      ),
    ).toThrow(
      "dist/index.js imports react/jsx-dev-runtime; build published React artifacts with productionReactJsx",
    );
  });
});
