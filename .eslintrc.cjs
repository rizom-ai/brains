module.exports = {
  root: true,
  extends: ["@brains/eslint-config"],
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: ['./tsconfig.json', './packages/*/tsconfig.json', './apps/*/tsconfig.json']
  }
};