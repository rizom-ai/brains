import { Window, type Document, type Element } from "happy-dom";
import type { BookUnit } from "../render-book";
import { unitsOfSections } from "../sections";
import { sameName } from "./archive-ocr-headings";
import { nameOf } from "./markup";
import {
  newTeiReading,
  readTei,
  turnPage,
  type TeiDialect,
  type TeiReading,
} from "./tei";

/** Where the volumes of MEGAdigital's Kapital section are served. */
export const MEGA_DOCS = "https://telota.bbaw.de/mega/docs/";

/** One volume's part of a work: the file and the editors' title of the work in it. */
export interface MegaEtxPart {
  /** The volume's file: MEGA_A2_B001-01_ETX.xml. */
  file: string;
  xml: string;
  /** The editors' title of the work within the volume. */
  text: string;
}

export interface MegaEtxWork {
  /** How a citation names the volume before its page: MEGA² II/1. */
  citation: string;
  /** The work's title, which its first heading may repeat. */
  title: string;
  /** Headings of divisions left out with all they hold. */
  skipHeadings?: string[];
}

/** Apparatus the editors set into the text: Marx's page numbers, figures. */
function isApparatus(element: Element): boolean {
  const name = nameOf(element);
  const type = element.getAttribute("type") ?? "";
  if (name === "add") {
    return element.getAttribute("resp") === "ed" && type.startsWith("mpb");
  }
  if (name === "label") return type === "mpb";
  return ["figure", "graphic", "milestone", "fw"].includes(name);
}

/** A MathML formula written out: a fraction as a/b, a power as a^b. */
function mathText(element: Element): string {
  const parts = Array.from(element.children).map(mathText);
  const grouped = (text: string): string =>
    /[\s+−-]/.test(text.trim()) ? `(${text.trim()})` : text.trim();
  switch (element.localName) {
    case "mfrac":
      return `${grouped(parts[0] ?? "")}/${grouped(parts[1] ?? "")}`;
    case "msup":
      return `${grouped(parts[0] ?? "")}^${grouped(parts[1] ?? "")}`;
    case "msub":
      return `${parts[0] ?? ""}${parts[1] ?? ""}`;
    default:
      return element.children.length > 0
        ? parts.join("")
        : element.textContent.trim();
  }
}

/** MEGA's TEI: numbered divisions, MathML formulas, superscripts set apart. */
const MEGA: TeiDialect = {
  isSkipped: isApparatus,
  isDivision: (element) => /^div\d?$/.test(nameOf(element)),
  formulaText: (formula) => mathText(formula),
  isEmphasis: (hi) => !/\b(sup|sub)\b/.test(hi.getAttribute("rendition") ?? ""),
  letters: (text) => text,
  // Marx's own page numbers are apparatus; the edition's pages are cited.
  turnsPage: (pb) => pb.getAttribute("ed") !== "manuscript",
};

function normalised(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** The work a volume holds under the editors' title. */
function workIn(document: Document, title: string): Element | undefined {
  const works = Array.from(document.getElementsByTagName("group")).flatMap(
    (group) =>
      Array.from(group.children).filter((child) => nameOf(child) === "text"),
  );
  return works.find((text) => {
    const head = Array.from(text.children)
      .find((child) => nameOf(child) === "front")
      ?.querySelector('div[type="editorialHead"]');
    return head ? sameName(normalised(head.textContent), title) : false;
  });
}

function readPart(
  part: MegaEtxPart,
  index: number,
  reading: TeiReading,
  work: MegaEtxWork,
): void {
  const window = new Window();
  try {
    const document = new window.DOMParser().parseFromString(
      part.xml,
      "application/xml",
    );
    const text = workIn(document, part.text);
    if (!text) throw new Error(`No "${part.text}" in ${part.file}`);
    const body = Array.from(text.children).find(
      (child) => nameOf(child) === "body",
    );
    if (!body) throw new Error(`"${part.text}" in ${part.file} has no body`);
    reading.page = { ...reading.page, part: index };
    // The page the work opens on is the edition's last break before it.
    const opening = Array.from(text.getElementsByTagName("pb"))
      .filter((pb) => (pb.compareDocumentPosition(body) & 4) === 4)
      .filter((pb) => MEGA.turnsPage(pb))
      .at(-1);
    if (opening) turnPage(opening, reading, MEGA);
    readTei([body], reading, work, MEGA);
  } finally {
    // Closing only releases the window's timers; parsing is already done.
    void window.happyDOM.close();
  }
}

/**
 * Read a work from MEGAdigital's volumes of the Kapital and its drafts: the
 * work the editors title in each volume, read on from one volume into the
 * next, its divisions as sections under their headings, Marx's footnotes
 * after the text, each part cited by volume and MEGA page. The editors'
 * title pages, apparatus and Marx's own page numbers are left out.
 */
export function parseMegaEtx(
  parts: MegaEtxPart[],
  work: MegaEtxWork,
): BookUnit[] {
  const reading = newTeiReading();
  parts.forEach((part, index) => {
    readPart(part, index, reading, work);
  });
  return unitsOfSections(reading.sections, (start) => ({
    citation: `${work.citation}, ${start.label}`,
    source: `${MEGA_DOCS}${parts[start.part]?.file ?? ""}`,
  }));
}
