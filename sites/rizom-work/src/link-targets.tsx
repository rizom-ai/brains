/** @jsxImportSource preact */
import type { JSX } from "preact";
import { Button, type ButtonProps } from "@rizom/site-rizom";

export const QUIZ_HREF = "https://form.typeform.com/to/NGqo9Fnf";
export const BOOKING_HREF = "mailto:contact@rizom.ai";

const NEW_TAB_HREFS = new Set([QUIZ_HREF, BOOKING_HREF]);

export function isNewTabHref(href: string): boolean {
  return NEW_TAB_HREFS.has(href);
}

export function newTabProps(href: string): { target?: string; rel?: string } {
  return isNewTabHref(href)
    ? { target: "_blank", rel: "noopener noreferrer" }
    : {};
}

export type WorkButtonVariant = NonNullable<ButtonProps["variant"]>;
export type WorkButtonSize = NonNullable<ButtonProps["size"]>;

export const WorkButton = (props: ButtonProps): JSX.Element => (
  <Button {...newTabProps(props.href)} {...props} />
);
