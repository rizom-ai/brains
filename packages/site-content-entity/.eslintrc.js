module.exports = {
  root: true,
  extends: ["@brains/eslint-config"],
  parserOptions: {
    project: "./tsconfig.json",
    tsconfigRootDir: __dirname,
  },
};