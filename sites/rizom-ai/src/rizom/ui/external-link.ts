import type { RizomLink } from "./types";

export function externalLinkProps(link: Pick<RizomLink, "external">): {
  target?: string;
  rel?: string;
} {
  return link.external ? { target: "_blank", rel: "noopener noreferrer" } : {};
}
