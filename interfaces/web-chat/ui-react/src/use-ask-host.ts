import { useEffect, useState, type RefObject } from "react";
import {
  ASK_BOX_ATTRIBUTE,
  ASK_NAME_ATTRIBUTE,
  ASK_PLACEHOLDER_ATTRIBUTE,
} from "@brains/contracts";

export interface AskHost {
  /** Whose brain this is (ASK_NAME_ATTRIBUTE). */
  owner: string | undefined;
  /** What the empty box asks for (ASK_PLACEHOLDER_ATTRIBUTE). */
  placeholder: string | undefined;
  /** The bar of the `.talk` panel the box sits in, for its header actions. */
  header: Element | null;
}

/** What the page the box is mounted in says about it, read once mounted. */
export function useAskHost(root: RefObject<HTMLElement | null>): AskHost {
  const [owner, setOwner] = useState<string>();
  const [placeholder, setPlaceholder] = useState<string>();
  const [header, setHeader] = useState<Element | null>(null);
  useEffect(() => {
    const host = root.current?.closest(`[${ASK_BOX_ATTRIBUTE}]`);
    // An empty attribute says nothing.
    const said = (name: string): string | undefined => {
      const value = host?.getAttribute(name)?.trim();
      if (!value) return undefined;
      return value;
    };
    setOwner(said(ASK_NAME_ATTRIBUTE));
    setPlaceholder(said(ASK_PLACEHOLDER_ATTRIBUTE));
    setHeader(root.current?.closest(".talk")?.querySelector(".ui-bar") ?? null);
  }, []);
  return { owner, placeholder, header };
}
