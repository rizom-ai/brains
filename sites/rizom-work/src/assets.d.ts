// @rizom/site-rizom-ai is typechecked from its source here, and it imports
// its stylesheets and icon as text.
declare module "*.css" {
  const content: string;
  export default content;
}

declare module "*.svg" {
  const content: string;
  export default content;
}
