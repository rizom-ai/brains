export type CvaClassProp =
  | { class?: string | undefined; className?: never }
  | { class?: never; className?: string | undefined }
  | { class?: never; className?: never };
