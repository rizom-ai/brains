import { createContext, type Context } from "react";

/**
 * The language of the page being rendered. The site renderer provides it
 * around every page; a section drawn per language reads it to pick its
 * drawing. It lives on the brain's side of the site package boundary, so a
 * site package never needs the same module instance to use it.
 */
export const PageLanguageContext: Context<string | undefined> = createContext<
  string | undefined
>(undefined);
