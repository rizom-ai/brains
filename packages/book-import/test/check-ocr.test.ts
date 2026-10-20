import { describe, expect, it } from "bun:test";
import {
  checkPages,
  lostHyphens,
  modernForms,
  referenceCorrections,
  referenceText,
} from "../src/check-ocr";

const reference =
  "Den Menschen der Vorzeit kennen wir in den Entwicklungsstadien, die er durchlaufen hat, durch die unbelebten Denkmäler und Geräte, die er uns hinterlassen. Er ist noch in gewissem Sinne unser Zeitgenosse; es leben Menschen, von denen wir glauben, daß sie den Primitiven noch sehr nahe stehen.";

describe("checkPages", () => {
  it("flags the words the OCR got wrong, against a transcription of the text", () => {
    const [page] = checkPages(
      [
        {
          page: 3,
          text: "Den Menschen der Vorzeit kennen wir in den Entwicklungs-\nstadien, die er durchlaufeu hat, durch die unbelebten Denkmäler",
        },
      ],
      reference,
    );

    expect(page?.covered).toBe(true);
    expect(page?.wrong).toEqual(["durchlaufeu"]);
    expect(page?.words).toBe(17);
  });

  it("takes a word in the print's old spelling as the transcription's modern one, a misread still as wrong", () => {
    const [page] = checkPages(
      [
        {
          page: 30,
          text: "Die Centralisation marschirte über die Ueberlieferung hinweg und giebt dem Gefängniß baare Zahlungen der sämmtlichen Civilisten in Frantreich und anderswo, wie man weiß, auch den Aerzten in Oesterreich, die getödtet wurden",
        },
      ],
      "Die Zentralisation marschierte über die Überlieferung hinweg und gibt dem Gefängnis bare Zahlungen der sämtlichen Zivilisten in Frankreich und anderswo, wie man weiß, auch den Ärzten in Österreich, die getötet wurden",
    );

    expect(page?.wrong).toEqual(["Frantreich"]);
  });

  it("counts no word of a passage the transcription's edition lacks", () => {
    const [page] = checkPages(
      [
        {
          page: 3,
          text: "Den Menschen der Vorzeit kennen wir in den Entwicklungsstadien, die er durchlaufen hat. Später kam ein Absatz über Kanzleischlüssel hinzu. Er ist noch in gewissem Sinne unser Zeitgenosse; es leben Menschen, von denen wir glauben",
        },
      ],
      reference,
    );

    expect(page?.covered).toBe(true);
    expect(page?.wrong).toEqual([]);
  });

  it("counts no real word where the transcription's edition reads otherwise", () => {
    const [page] = checkPages(
      [
        {
          page: 4,
          text: "Er ist noch in gewissem Sinne unser Zeitgenosse; es leben Menschen",
        },
      ],
      "Er ist noch in gewissen Sinne unser Zeitgenosse; es leben Menschen",
      (word) => word === "gewissem",
    );

    expect(page?.wrong).toEqual([]);
  });

  it("reads old spelling as the same word", () => {
    const [page] = checkPages(
      [{ page: 4, text: "Er ist noch in gewissem Sinne unser Zeitgenosse" }],
      "Er ist noch in gewissem Sinne unser Zeitgenosse",
    );
    const [old] = checkPages(
      [{ page: 4, text: "Der Theil, den wir thun, ist der Teil, den wir tun" }],
      "Der Teil, den wir tun, ist der Theil, den wir thun",
    );

    expect(page?.wrong).toEqual([]);
    expect(old?.wrong).toEqual([]);
  });

  it("joins a word broken over two pages, and a compound the edition writes apart", () => {
    const checks = checkPages(
      [
        {
          page: 6,
          text: "Den Menschen der Vorzeit kennen wir in den Entwicklungs-",
        },
        {
          page: 7,
          text: "stadien, die er durchlaufen hat; er geht zugrunde, durch die unbelebten Denkmäler",
        },
      ],
      "Den Menschen der Vorzeit kennen wir in den Entwicklungsstadien, die er durchlaufen hat; er geht zu Grunde, durch die unbelebten Denkmäler",
    );

    expect(checks.map((check) => check.wrong)).toEqual([[], []]);
  });

  it("joins a word broken at a page's last line of text, above its notes", () => {
    const checks = checkPages(
      [
        {
          page: 8,
          text: "Den Menschen der Vorzeit kennen wir in den Entwicklungs-\n¹) Vgl. die Anmerkung.",
        },
        { page: 9, text: "stadien, die er durchlaufen hat" },
      ],
      "Den Menschen der Vorzeit kennen wir in den Entwicklungsstadien, die er durchlaufen hat. Vgl. die Anmerkung.",
    );

    expect(checks.map((check) => check.wrong)).toEqual([[], []]);
  });

  it("leaves out a page the transcription's edition does not have", () => {
    const [page] = checkPages(
      [
        {
          page: 5,
          text: "Ein ganz anderer Absatz, den erst eine spätere Auflage hinzugefügt hat, steht hier allein.",
        },
      ],
      reference,
    );

    expect(page?.covered).toBe(false);
  });
});

describe("referenceText", () => {
  it("takes a Gutenberg text between its start and end marks", () => {
    const raw = [
      "The Project Gutenberg eBook of Totem und Tabu",
      "*** START OF THE PROJECT GUTENBERG EBOOK TOTEM UND TABU ***",
      "Den Menschen der Vorzeit",
      "*** END OF THE PROJECT GUTENBERG EBOOK TOTEM UND TABU ***",
      "License text",
    ].join("\n");

    expect(referenceText(raw).trim()).toBe("Den Menschen der Vorzeit");
  });

  it("takes a web page's text, a paragraph to a line, its scripts and styles left out", () => {
    const raw = `<html><head><title>MEW 7</title><style>p { color: red }</style></head>
<body><script>var x = 1;</script><h3>I.</h3>
<p>Mit Ausnahme einiger <i>weniger</i>
Kapitel tr&auml;gt jeder</p><p>bedeutendere Abschnitt</p></body></html>`;

    expect(referenceText(raw).split("\n").filter(Boolean)).toEqual([
      "I.",
      "Mit Ausnahme einiger weniger Kapitel trägt jeder",
      "bedeutendere Abschnitt",
    ]);
  });
});

describe("referenceCorrections", () => {
  const reference =
    "Ich habe die Absicht, nach Hause zu gehen, wenn es dunkel wird. Er suchte die Lösung, welcher er folgen konnte, und fand sie.";

  it("fixes a misread word where the words around it match the transcription", () => {
    expect(
      referenceCorrections(
        [{ page: 8, text: "Ich habe ie Absicht, nach Hause zu gehen," }],
        reference,
      ),
    ).toEqual([
      {
        page: 8,
        from: "Ich habe ie Absicht, nach",
        to: "Ich habe die Absicht, nach",
      },
    ]);
  });

  it("replaces a run of scraps with the transcription's words between", () => {
    expect(
      referenceCorrections(
        [{ page: 9, text: "Er suchte die Bu ah Ib welcher er folgen konnte" }],
        reference,
      ),
    ).toEqual([
      {
        page: 9,
        from: "suchte die Bu ah Ib welcher er",
        to: "suchte die Lösung, welcher er",
      },
    ]);
  });

  it("reads the words around a misread that opens a line from the line above, and fixes its own line", () => {
    expect(
      referenceCorrections(
        [
          {
            page: 8,
            text: "Ich habe die Absicht, nach\nHanse zu gehen, wenn es",
          },
        ],
        reference,
      ),
    ).toEqual([{ page: 8, from: "Hanse zu gehen", to: "Hause zu gehen" }]);
  });

  it("reads the words around a misread that ends a line from the line below, and fixes its own line", () => {
    expect(
      referenceCorrections(
        [
          {
            page: 9,
            text: "Er suchte die Lösung, welcher er folgen kounte,\nund fand sie.",
          },
        ],
        reference,
      ),
    ).toEqual([
      { page: 9, from: "er folgen kounte,", to: "er folgen konnte," },
    ]);
  });

  it("leaves a word alone where the words around it are not the transcription's", () => {
    expect(
      referenceCorrections(
        [{ page: 10, text: "Ganz andere Worte stehen hier xqz und anderswo." }],
        reference,
      ),
    ).toEqual([]);
  });
});

describe("referenceCorrections between editions", () => {
  it("keeps a word the author's text uses elsewhere, though this edition has another", () => {
    const corpus = new Set(["beginne"]);

    expect(
      referenceCorrections(
        [{ page: 9, text: "ursprünglich im Beginne der Zeiten war" }],
        "ursprünglich im Beginn der Zeiten war",
        (word) => corpus.has(word.toLowerCase()),
      ),
    ).toEqual([]);
  });

  it("sets the transcription's dashes and quotes as the edition prints them", () => {
    expect(
      referenceCorrections(
        [{ page: 28, text: "im allgemeinen — ügegen das mächtige" }],
        "im allgemeinen -- gegen das mächtige",
      ),
    ).toEqual([
      {
        page: 28,
        from: "im allgemeinen — ügegen das mächtige",
        to: "im allgemeinen — gegen das mächtige",
      },
    ]);
  });

  it("sets a transcription's straight quotes as the German quotes the edition prints", () => {
    expect(
      referenceCorrections(
        [{ page: 22, text: "und die „Partel Marx“ zu London" }],
        'und die "Partei Marx" zu London',
      ),
    ).toEqual([
      {
        page: 22,
        from: "und die „Partel Marx“ zu",
        to: "und die „Partei Marx“ zu",
      },
    ]);
  });

  it("leaves the punctuation the line above ends with to that line", () => {
    expect(
      referenceCorrections(
        [{ page: 20, text: "wie es dunkel wird.\nThe wir nun weiter gehen" }],
        "wie es dunkel wird. Ehe wir nun weiter gehen",
      ),
    ).toEqual([{ page: 20, from: "The wir nun", to: "Ehe wir nun" }]);
  });

  it("leaves a misread alone where the line beside it sets the punctuation between otherwise", () => {
    expect(
      referenceCorrections(
        [{ page: 20, text: "wie es dunkel wird:\nThe wir nun weiter gehen" }],
        "wie es dunkel wird. Ehe wir nun weiter gehen",
      ),
    ).toEqual([]);
  });
});

describe("referenceCorrections against a transcription in today's spelling", () => {
  const modern =
    "Sie wollten die Lasten neu verteilen. Er mochte die Steuer ohne die Verteilung neu zu regeln, und das Volk murrte laut.";

  it("writes the fix in the edition's own spelling, as its text uses the word elsewhere", () => {
    const fixes = referenceCorrections(
      [
        {
          page: 21,
          text: "Sie wollten die Vertheilung der Lasten neu ordnen.\nEr mochte die Steuer ohne die Vertheiluug neu zu regeln, und das Volk murrte laut.",
        },
      ],
      modern + " Sie wollten die Verteilung der Lasten neu ordnen.",
    );

    expect(fixes.map((fix) => fix.to)).toContain("ohne die Vertheilung neu zu");
  });

  it("makes no fix that would bring the transcription's own note marks in", () => {
    const fixes = referenceCorrections(
      [
        {
          page: 98,
          text: "Sie haben wie unseren Vorfahren, den Grees), nicht die Stadt erobert.",
        },
      ],
      "Sie haben wie unseren Vorfahren, den Grecs (3), nicht die Stadt erobert.",
    );

    expect(fixes).toEqual([]);
  });

  it("makes no fix whose word the edition never uses, rather than write today's spelling into it", () => {
    const fixes = referenceCorrections(
      [
        {
          page: 21,
          text: "Ein Theil der Leute wußte es.\nEr mochte die Steuer ohne die Vertheiluug neu zu regeln, und das Volk murrte laut.",
        },
      ],
      `Ein Teil der Leute wußte es. ${modern}`,
    );

    expect(fixes).toEqual([]);
  });
});

describe("lostHyphens", () => {
  it("gives a line's last word back the hyphen the OCR lost, where the transcription knows only the joined word", () => {
    const fixes = lostHyphens(
      [
        {
          page: 47,
          text: "Marrast, der zugleich den Amphi\ntryon und den Gast spielte, der\nGefangene des Tages",
        },
      ],
      "Marrast, der zugleich den Amphitryon und den Gast spielte, der Gefangene des Tages",
    );

    expect(fixes).toEqual([
      {
        page: 47,
        from: "den Amphi",
        to: "den Amphi-",
      },
    ]);
  });

  it("places the fix by as much of the line's end as no line before it holds", () => {
    const fixes = lostHyphens(
      [
        {
          page: 71,
          text: "Sie schützte die Konstitution vor ihm\nin die Versammlung durch die Kon\nstitution, den Präsidenten",
        },
      ],
      "Sie schützte die Konstitution vor ihm in die Versammlung durch die Konstitution, den Präsidenten",
    );

    expect(fixes).toEqual([
      { page: 71, from: "durch die Kon", to: "durch die Kon-" },
    ]);
  });

  it("gives the hyphen back to a word broken over a page", () => {
    const fixes = lostHyphens(
      [
        { page: 21, text: "Nicht die französische Bour" },
        { page: 22, text: "geoisie herrschte unter Louis Philipp" },
      ],
      "Nicht die französische Bourgeoisie herrschte unter Louis Philipp",
    );

    expect(fixes).toEqual([
      {
        page: 21,
        from: "französische Bour",
        to: "französische Bour-",
      },
    ]);
  });
});

describe("modernForms", () => {
  it("spells a word of 1850 as after the spelling reform, for the dictionary to know it", () => {
    expect(modernForms("wüthete")).toContain("wütete");
    expect(modernForms("großentheils")).toContain("großenteils");
    expect(modernForms("dupiren")).toContain("dupieren");
    expect(modernForms("niedervotirt")).toContain("niedervotiert");
    expect(modernForms("Civilisation")).toContain("Zivilisation");
    expect(modernForms("Kompagnie")).toContain("Kompagnie");
    expect(modernForms("Gefängniß")).toContain("Gefängnis");
    expect(modernForms("Uebergang")).toContain("Übergang");
    expect(modernForms("muß")).toContain("muss");
  });
});
