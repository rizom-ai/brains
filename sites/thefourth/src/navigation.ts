/**
 * The site's own pages, in the order the header, the menu and the footer
 * name them. Sam's design keeps the four names in English on Chinese pages
 * too. The site draws its navigation from this list, not from the routes the
 * brain's plugins register.
 */
export interface Page {
  id: string;
  path: string;
  label: string;
}

export const PAGES: readonly Page[] = [
  { id: "what", path: "/what", label: "What" },
  { id: "who", path: "/who", label: "Who" },
  { id: "how", path: "/how", label: "How" },
  { id: "about", path: "/about", label: "About" },
];

interface MenuWords {
  home: string;
  menu: string;
  top: string;
}

/** The menu's own words, per language. */
const MENU_WORDS: Record<string, MenuWords> = {
  en: { home: "Home", menu: "Menu", top: "Back to top" },
  "zh-tw": { home: "首頁", menu: "選單", top: "回到頂端" },
};

export function menuWords(language: string): MenuWords {
  return (
    MENU_WORDS[language.toLowerCase()] ?? {
      home: "Home",
      menu: "Menu",
      top: "Back to top",
    }
  );
}
