import type { ClassValue } from "class-variance-authority/types";

export type CvaClassProp =
  | { class: ClassValue; className?: never }
  | { class?: never; className: ClassValue }
  | { class?: never; className?: never };
