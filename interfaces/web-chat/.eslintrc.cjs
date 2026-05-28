module.exports = {
  overrides: [
    {
      // Vendored shadcn/ui and AI Elements primitives — kept in sync with the
      // upstream registry. Adding explicit return types here would diverge from
      // upstream and make future syncs painful.
      files: [
        "ui-react/src/ui/**/*.{ts,tsx}",
        "ui-react/src/ai-elements/**/*.{ts,tsx}",
      ],
      rules: {
        "@typescript-eslint/explicit-function-return-type": "off",
        "@typescript-eslint/explicit-module-boundary-types": "off",
        "@typescript-eslint/prefer-nullish-coalescing": "off",
        "@typescript-eslint/no-unnecessary-condition": "off",
      },
    },
  ],
};
