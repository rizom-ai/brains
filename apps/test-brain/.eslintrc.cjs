module.exports = {
  extends: ["@brains/eslint-config/index.js"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: "./tsconfig.json",
    tsconfigRootDir: __dirname,
  },
  root: true,
};