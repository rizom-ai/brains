/** A centred line that can belong to a heading, as the page sets it. */
export type HeadingLine =
  | { kind: "part"; text: string }
  | { kind: "chapter"; numeral: string }
  | { kind: "letter"; letter: string }
  | { kind: "caps"; text: string; size: number; misread?: boolean }
  | { kind: "qualifier"; text: string };

/** A heading's place in a work: part above chapter above subsection. */
export type HeadingLevel = 0 | 1 | 2;

/** A heading block as read, before its words are cased. */
export interface Heading {
  level: HeadingLevel | null;
  /** The part's own name or the subsection's letter; chapters are numbered by place. */
  label: string | null;
  numbered: boolean;
  /** The numeral as the OCR read it; chapters are numbered by place. */
  numeral: string | null;
  /** Capitals lines, a smaller line opening a subtitle. */
  title: string[];
  /** The title came from a line the OCR read in small letters. */
  misread: boolean;
  qualifiers: string[];
}

/** A part's name, its word for part however the OCR read it ("Tetl"). */
const PART =
  /^(erster|zweiter|dritter|vierter|fünfter|[IVX]+\.?)\s+t\S{2,3}$/iu;
/** A lecture's number, however the OCR read it. */
const LECTURE = /^\S{1,8}\s*(?:vorlesung|kapitel)$/iu;
/** A roman numeral, with the OCR's usual misreadings of its strokes. */
const NUMERAL = /^[IVXLHUlıi18Ä|vxTY3]{1,6}[.,]?$/u;
const LETTER = /^[A-H]\.?$/u;
const QUALIFIER = /^\(.+\)$/u;

function capitalised(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/** A line mostly in capitals: a heading's title, not running text. */
function isCapitals(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? [];
  const capitals = text.match(/\p{Lu}/gu) ?? [];
  // A word of four letters at least: a picture's noise reads as scraps.
  return (
    /\p{L}{4}/u.test(text) &&
    letters.length >= 3 &&
    capitals.length / letters.length >= 0.7
  );
}

/** What a centred line contributes to a heading, or null for running text. */
export function headingLineOf(line: string, size: number): HeadingLine | null {
  // Stray marks at a heading's edges are not part of it.
  const text = line.replace(/^[^\p{L}\d(]+\s+|\s+[^\p{L}\d).]+$/gu, "");
  const part = PART.exec(text);
  if (part?.[1]) {
    const ordinal = part[1];
    const named = /^[IVX]/u.test(ordinal) ? ordinal : capitalised(ordinal);
    return { kind: "part", text: `${named} Teil` };
  }
  if (LECTURE.test(text)) {
    return {
      kind: "chapter",
      numeral: text.replace(/\s*(?:vorlesung|kapitel)$/iu, ""),
    };
  }
  // A lone letter that no numeral misreads as is a subsection's.
  if (LETTER.test(text) && !/^I/u.test(text)) {
    return { kind: "letter", letter: text.replace(/\.$/u, "") };
  }
  if (NUMERAL.test(text)) {
    return { kind: "chapter", numeral: text.replace(/[.,]$/u, "") };
  }
  if (QUALIFIER.test(text)) return { kind: "qualifier", text };
  if (isCapitals(text)) return { kind: "caps", text, size };
  return null;
}

/** A subtitle is set this much smaller than the title above it. */
const SUBTITLE_SIZE = 0.85;

/** Read a block of heading lines as one heading. */
export function headingOf(lines: HeadingLine[]): Heading {
  return lines.reduce<Heading & { titleSize: number | null }>(
    (heading, line) => {
      switch (line.kind) {
        case "part":
          return { ...heading, level: 0, label: line.text };
        case "chapter":
          return {
            ...heading,
            level: 1,
            numbered: true,
            numeral: line.numeral,
          };
        case "letter":
          return { ...heading, level: 2, label: line.letter };
        case "qualifier":
          return { ...heading, qualifiers: [...heading.qualifiers, line.text] };
        case "caps": {
          const last = heading.title.at(-1);
          const misread = heading.misread || line.misread === true;
          if (last === undefined || heading.titleSize === null) {
            return {
              ...heading,
              title: [line.text],
              titleSize: line.size,
              misread,
            };
          }
          const subtitle = line.size < heading.titleSize * SUBTITLE_SIZE;
          return {
            ...heading,
            misread,
            title: subtitle
              ? [...heading.title, line.text]
              : [...heading.title.slice(0, -1), `${last} ${line.text}`],
          };
        }
      }
    },
    {
      level: null,
      label: null,
      numbered: false,
      numeral: null,
      title: [],
      misread: false,
      qualifiers: [],
      titleSize: null,
    },
  );
}

const WORD = /\p{L}+/gu;
/** A word in small letters, or capitalised as a noun is. */
const SPELLED = /^\p{Lu}?\p{Ll}+$/u;

/** A work's own spelling of its words, learned from its running text. */
export interface Spelling {
  /** A heading set in capitals, cased as the text spells its words. */
  cased: (capitals: string) => string;
  /** Whether the text uses a word, however it is cased. */
  knows: (word: string) => boolean;
}

/**
 * Case words set in capitals as the text itself spells them: a German noun is
 * capitalised wherever it stands, other words are not. Each word takes its
 * most frequent spelling in the running text; a word the text never uses is
 * read as a noun, and a single letter is an initial. Capitals print ß as SS,
 * so that spelling is tried too.
 */
export function createSpelling(texts: string[]): Spelling {
  const counts = texts.reduce<Map<string, Map<string, number>>>(
    (tally, text) => {
      (text.replace(/ı/gu, "i").match(WORD) ?? [])
        // Only words spelled as words: capitals and misreads tell nothing.
        .filter((word) => SPELLED.test(word))
        .forEach((word) => {
          const key = word.toLowerCase();
          const forms = tally.get(key) ?? new Map<string, number>();
          forms.set(word, (forms.get(word) ?? 0) + 1);
          tally.set(key, forms);
        });
      return tally;
    },
    new Map(),
  );
  const spelling = (key: string): string | null => {
    const forms = counts.get(key) ?? counts.get(key.replace(/ss/gu, "ß"));
    if (!forms) return null;
    return (
      [...forms.entries()].sort(
        (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1),
      )[0]?.[0] ?? null
    );
  };
  const cased = (title: string): string => {
    // A word broken over two lines of the heading is one word where the text
    // knows it so; otherwise the hyphen joins a compound.
    const capitals = title
      .replace(/ı/gu, "i")
      .replace(/(\p{L}+)- (\p{L}+)/gu, (broken, head: string, tail: string) =>
        spelling(`${head}${tail}`.toLowerCase()) === null
          ? broken
          : `${head}${tail}`,
      );
    return capitals.replace(WORD, (word, offset: number) => {
      // A word the page already spells as a word, or an initial, stays as
      // printed.
      // An s after an apostrophe is a possessive, not an initial.
      const possessive = /['’]$/u.test(capitals.slice(0, offset));
      const spelled = possessive
        ? word.toLowerCase()
        : SPELLED.test(word) || word.length === 1
          ? word
          : (spelling(word.toLowerCase()) ?? capitalised(word));
      // A title, or a subtitle after its full stop, opens with a capital.
      const opens = offset === 0 || /[.:]\s*$/u.test(capitals.slice(0, offset));
      return opens
        ? spelled.charAt(0).toUpperCase() + spelled.slice(1)
        : spelled;
    });
  };
  return {
    cased,
    knows: (word) => spelling(word.toLowerCase().replace(/ı/gu, "i")) !== null,
  };
}

/** Share of a heading's tokens that must be words of three letters or more, */
const WORDY = 0.5;
/** and of those, the share the work's text must use. */
const KNOWN = 0.5;

/**
 * Whether a line read as a heading is made of words, not a picture's scraps:
 * mostly words of three letters or more, mostly words the work itself uses.
 */
export function isWordy(text: string, spelling: Spelling): boolean {
  const tokens = text.split(/\s+/u).filter((token) => token.length > 0);
  const words = tokens.flatMap((token) => {
    const word = /\p{L}{3,}/u.exec(token)?.[0];
    // A word has more than one letter in it; the OCR's EEE has not.
    return word === undefined || new Set(word.toLowerCase()).size < 2
      ? []
      : [word];
  });
  return (
    tokens.length > 0 &&
    words.length / tokens.length >= WORDY &&
    words.filter((word) => spelling.knows(word)).length / words.length >= KNOWN
  );
}

/** Letters only, in small letters, ß as ss: what two spellings share. */
function letters(text: string): string {
  return text
    .toLowerCase()
    .replace(/ı/gu, "i")
    .replace(/ß/gu, "ss")
    .replace(/[^\p{Ll}]/gu, "");
}

function bigrams(text: string): Map<string, number> {
  return Array.from({ length: Math.max(0, text.length - 1) }, (_, index) =>
    text.slice(index, index + 2),
  ).reduce(
    (counts, pair) => counts.set(pair, (counts.get(pair) ?? 0) + 1),
    new Map<string, number>(),
  );
}

/** Share of letter pairs two texts have in common. */
function likeness(a: string, b: string): number {
  const first = bigrams(a);
  const second = bigrams(b);
  const shared = [...first].reduce(
    (sum, [pair, count]) => sum + Math.min(count, second.get(pair) ?? 0),
    0,
  );
  const total = [...first.values(), ...second.values()].reduce(
    (sum, count) => sum + count,
    0,
  );
  return total === 0 ? 0 : (2 * shared) / total;
}

/** Headings this alike in their letters name the same thing. */
const ALIKE = 0.5;

/**
 * Whether a heading set in capitals reads as the given title, however the OCR
 * spelled it; the heading may run on into a subtitle.
 */
export function namesTitle(heading: string, title: string): boolean {
  const read = letters(heading);
  const known = letters(title);
  return (
    Math.max(
      likeness(read, known),
      likeness(read.slice(0, known.length + 2), known),
    ) >= ALIKE
  );
}

/** Names this alike in their letters are one name, however each is printed. */
const SAME = 0.8;

/** Whether two printings name the same heading: a running head and a title. */
export function sameName(a: string, b: string): boolean {
  return likeness(letters(a), letters(b)) >= SAME;
}
