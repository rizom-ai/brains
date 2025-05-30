module.exports = {
  extends: ["@brains/eslint-config"],
  parserOptions: {
    project: "./tsconfig.json"
  },
  ignorePatterns: ["node_modules", "dist"]
};