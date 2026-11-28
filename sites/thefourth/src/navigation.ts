/**
 * The site's own pages, in the order the header, the menu and the footer
 * name them. Sam's design keeps the four names in English on Chinese pages
 * too, each glossed in Chinese in the header and the menu. The site draws its
 * navigation from this list, not from the routes the brain's plugins
 * register.
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

/** What each page is called in a language whose page names stay English. */
const PAGE_GLOSSES: Record<string, Record<string, string>> = {
  "zh-tw": {
    what: "服務項目",
    who: "合作對象",
    how: "工作方法",
    about: "關於我們",
  },
};

/** A page's gloss in the language being read, when it has one. */
export function pageGloss(language: string, id: string): string | undefined {
  return PAGE_GLOSSES[language.toLowerCase()]?.[id];
}

interface MenuWords {
  home: string;
  menu: string;
  top: string;
  /** The logo's label, after the site's title. */
  homeLabel: string;
  main: string;
  footer: string;
  language: string;
}

const ENGLISH_WORDS: MenuWords = {
  home: "Home",
  menu: "Menu",
  top: "Back to top",
  homeLabel: "home",
  main: "Main",
  footer: "Footer",
  language: "Language",
};

/** The chrome's own words, per language. */
const MENU_WORDS: Record<string, MenuWords> = {
  en: ENGLISH_WORDS,
  "zh-tw": {
    home: "首頁",
    menu: "選單",
    top: "回到頂端",
    homeLabel: "首頁",
    main: "主選單",
    footer: "頁尾",
    language: "語言",
  },
};

export function menuWords(language: string): MenuWords {
  return MENU_WORDS[language.toLowerCase()] ?? ENGLISH_WORDS;
}
