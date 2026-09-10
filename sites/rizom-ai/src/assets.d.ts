// CSS is embedded by Bun's text loader in the server-rendered route.
declare module "*.css" {
  const text: string;
  export default text;
}
