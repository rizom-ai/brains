import { Window, type Element, type Node } from "happy-dom";
import type { BookUnit } from "../render-book";
import { unitsOfSections, type TitledSection } from "../sections";
import {
  TEXT_NODE,
  emphasised,
  escapeMarkdown,
  isElement,
  mergedEmphasis,
  nameOf,
} from "./markup";

/** A letter as MEGAdigital transcribes it. */
export interface MegaLetterText {
  /** When it was written, as the editors date it: 1867-07-20. */
  date: string | null;
  /** The language most of it is written in. */
  language: Language;
  /** The transcription's licence, as its header links it. */
  licence: string | null;
  paragraphs: string[];
}

/** A letter of the edition, with the heading the edition lists it under. */
export interface MegaLetter {
  /** MEGAdigital's id: M0000300. */
  id: string;
  /** Karl Marx an Ferdinand Freiligrath in London. London, 20. Juli 1867 */
  heading: string;
  letter: MegaLetterText;
}

/** The languages a letter is told to be written in. */
export const LANGUAGES = ["de", "en", "fr"] as const;
export type Language = (typeof LANGUAGES)[number];

const VIEW = "https://megadigital.bbaw.de/briefe/detail.xql?id=";
/** Elements read as a paragraph of their own. */
const PARAGRAPHS = new Set(["dateline", "salute", "p", "signed", "item"]);
/** Elements the editors add, and what the writer struck out. */
const LEFT_OUT = new Set(["note", "del", "address", "fw", "figure"]);
/** Each language's commonest short words, by which a text is told apart. */
const COMMON_WORDS: Record<Language, Set<string>> = {
  de: new Set(
    "der die das und ist nicht ich ein eine zu mit von den dem sich auf für es daß dass wie auch noch aber hat wird ob".split(
      " ",
    ),
  ),
  en: new Set(
    "the and of to is that it in for with as was be have you this not but your my do whether how".split(
      " ",
    ),
  ),
  fr: new Set(
    "le la les et de des que est je un une pour pas vous qui dans ce il ne au si comment".split(
      " ",
    ),
  ),
};

/** The language whose common words a text uses most. */
export function languageOf(text: string): Language {
  const words = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  const counts = LANGUAGES.map(
    (language) =>
      [
        language,
        words.filter((word) => COMMON_WORDS[language].has(word)).length,
      ] as const,
  );
  return counts.reduce((best, next) => (next[1] > best[1] ? next : best))[0];
}

/** An element's text as written: the editors' notes and struck-out text left out. */
function inlineText(node: Node): string {
  if (node.nodeType === TEXT_NODE) return escapeMarkdown(node.textContent);
  if (!isElement(node)) return "";
  const name = nameOf(node);
  if (LEFT_OUT.has(name)) return "";
  if (name === "lb") return " ";
  if (name === "gap") return "[…]";
  if (name === "choice") {
    const reading =
      Array.from(node.children).find((child) =>
        ["corr", "expan", "reg"].includes(nameOf(child)),
      ) ?? node.children[0];
    return reading ? inlineText(reading) : "";
  }
  const inner = Array.from(node.childNodes).map(inlineText).join("");
  return name === "hi" ? emphasised(inner) : inner;
}

function spaced(text: string): string {
  return mergedEmphasis(text)
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?)])/g, "$1")
    .trim();
}

function paragraphsOf(node: Node): string[] {
  if (!isElement(node)) return [];
  const name = nameOf(node);
  if (LEFT_OUT.has(name)) return [];
  if (PARAGRAPHS.has(name)) {
    const text = spaced(inlineText(node));
    return text.length > 0 ? [text] : [];
  }
  return Array.from(node.childNodes).flatMap(paragraphsOf);
}

/** The date the editors give the letter: when it was written, or its earliest. */
function dateOf(document: {
  querySelector(selector: string): Element | null;
}): string | null {
  const date = document.querySelector('correspAction[type="sent"] date');
  return (
    date?.getAttribute("when") ??
    date?.getAttribute("notBefore") ??
    date?.getAttribute("from") ??
    date?.getAttribute("notAfter") ??
    null
  );
}

/**
 * Read a letter from MEGAdigital's TEI: its dateline, salutation, text and
 * signature as written, abbreviations expanded and slips corrected as the
 * editors read them; their notes and what the writer struck out are left out.
 */
export function parseMegaLetter(xml: string): MegaLetterText {
  const window = new Window();
  try {
    const document = new window.DOMParser().parseFromString(
      xml,
      "application/xml",
    );
    const body = document.getElementsByTagName("body")[0];
    const paragraphs = body ? paragraphsOf(body) : [];
    return {
      date: dateOf(document),
      language: languageOf(paragraphs.join(" ")),
      licence:
        document.getElementsByTagName("licence")[0]?.getAttribute("target") ??
        null,
      paragraphs,
    };
  } finally {
    // Closing only releases the window's timers; parsing is already done.
    void window.happyDOM.close();
  }
}

/** The edition's documents as its API lists them: id and heading. */
export function parseMegaListing(
  xml: string,
): Array<{ id: string; heading: string }> {
  const window = new Window();
  try {
    const document = new window.DOMParser().parseFromString(
      xml,
      "application/xml",
    );
    return Array.from(document.getElementsByTagName("document")).flatMap(
      (entry) => {
        const uri = entry.getElementsByTagName("uri")[0]?.textContent ?? "";
        const id = /(M\d+)\.xml$/.exec(uri.trim())?.[1];
        const heading = (
          entry.getElementsByTagName("title")[0]?.textContent ?? ""
        )
          .replace(/\s+/g, " ")
          .trim();
        return id ? [{ id, heading }] : [];
      },
    );
  } finally {
    // Closing only releases the window's timers; parsing is already done.
    void window.happyDOM.close();
  }
}

/** Whether the edition lists a letter as the writer's, alone or with another. */
export function isWritersLetter(heading: string, writer: string): boolean {
  return new RegExp(`^${writer} (und [^.]+ )?an `).test(heading);
}

/** A letter's title: its heading without its writer, Mit for a joint one. */
function titleOf(heading: string, writer: string): string {
  if (heading.startsWith(`${writer} und `)) {
    return `Mit ${heading.slice(writer.length + " und ".length)}`;
  }
  const rest = heading.startsWith(`${writer} `)
    ? heading.slice(writer.length + 1)
    : heading;
  return `${rest.charAt(0).toUpperCase()}${rest.slice(1)}`;
}

/**
 * A writer's letters as a book's units, in the order they were written: each
 * under its year, titled and cited by its heading, linked to its page on
 * MEGAdigital.
 */
export function megaLetterUnits(
  letters: MegaLetter[],
  writer: string,
): BookUnit[] {
  const ordered = [...letters].sort(
    (a, b) =>
      (a.letter.date ?? "").localeCompare(b.letter.date ?? "") ||
      a.id.localeCompare(b.id),
  );
  const years = new Map<string, object>();
  const yearOf = (year: string): object => {
    const found = years.get(year);
    if (found) return found;
    const created = {};
    years.set(year, created);
    return created;
  };
  const byId = new Map(ordered.map((letter) => [letter.id, letter]));
  const sections: Array<
    TitledSection<{ text: string; page: number; id: string }>
  > = ordered.map((letter, index) => {
    const year = (letter.letter.date ?? "").slice(0, 4);
    const title = titleOf(letter.heading, writer);
    return {
      path: [yearOf(year), letter],
      titles: [year, title],
      paragraphs: letter.letter.paragraphs.map((text) => ({
        text,
        page: index,
        id: letter.id,
      })),
      notes: [],
    };
  });
  return unitsOfSections(sections, (start) => {
    const letter = byId.get(start.id);
    return {
      citation: letter ? titleOf(letter.heading, writer) : start.id,
      source: `${VIEW}${start.id}`,
    };
  });
}
