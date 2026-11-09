import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createPageOcr,
  frakturRead,
  preparationFor,
  scanImages,
  tessdataFor,
  volumeOfPages,
  withGreekReadings,
  type PageOcr,
} from "../src/page-ocr";

function tesseractPage(text: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en">
 <head><title></title></head>
 <body>
  <div class='ocr_page' id='page_1' title='image "stdin"; bbox 0 0 1903 2969; ppageno 0; scan_res 300 300'>
   <div class='ocr_carea' id='block_1_1' title="bbox 200 300 1700 400">
    <p class='ocr_par' id='par_1_1' lang='frk' title="bbox 200 300 1700 400">
     <span class='ocr_line' id='line_1_1' title="bbox 200 300 1700 400; baseline 0 -10; x_size 52; x_descenders 12; x_ascenders 14">
      <span class='ocrx_word' id='word_1_1' title='bbox 200 300 900 400; x_wconf 91'>${text}</span>
     </span>
    </p>
   </div>
  </div>
 </body>
</html>`;
}

describe("volumeOfPages", () => {
  it("numbers each page by its leaf and reads the long s as s, ꝛc. as etc., however misread", () => {
    const volume = volumeOfPages([
      tesseractPage("Geſellſchaft"),
      tesseractPage("Klaſſen"),
      tesseractPage("ꝛc."),
      tesseractPage("ꝛe."),
      tesseractPage("ꝛ2c."),
    ]);

    expect(volume.match(/<div class='ocr_page' id='page_\d+'/g)).toEqual([
      "<div class='ocr_page' id='page_0'",
      "<div class='ocr_page' id='page_1'",
      "<div class='ocr_page' id='page_2'",
      "<div class='ocr_page' id='page_3'",
      "<div class='ocr_page' id='page_4'",
    ]);
    expect(volume).toContain("Gesellschaft");
    expect(volume).toContain("Klassen");
    expect(volume).not.toContain("ſ");
    expect(volume).toContain(">etc.</span>");
    expect(volume).not.toContain("ꝛ");
  });
});

describe("volumeOfPages, roman type", () => {
  it("reads a page another model read as it reads, its dash a dash, where the scan is not Fraktur", () => {
    const volume = volumeOfPages(
      [tesseractPage("vigor—"), tesseractPage("Uber")],
      [],
      (hocr) => hocr,
    );

    expect(volume).toContain(">vigor—</span>");
    expect(volume).toContain(">Uber</span>");
  });
});

describe("volumeOfPages, numbered", () => {
  it("gives each page its printed number, counted from the first page's, where the scan states it", () => {
    const volume = volumeOfPages(
      [tesseractPage("Messieurs"), tesseractPage("communisme")],
      [10, 11],
    );

    expect(volume.match(/<span class='ocr_pageno'>\d+<\/span>/g)).toEqual([
      "<span class='ocr_pageno'>10</span>",
      "<span class='ocr_pageno'>11</span>",
    ]);
  });

  it("leaves a page the scan does not number to its running head", () => {
    const volume = volumeOfPages(
      [tesseractPage("Messieurs"), tesseractPage("communisme")],
      [undefined, 7],
    );

    expect(volume.match(/<span class='ocr_pageno'>\d+<\/span>/g)).toEqual([
      "<span class='ocr_pageno'>7</span>",
    ]);
  });
});

describe("volumeOfPages, capital umlauts", () => {
  it("dots the capital umlauts the Fraktur model reads without them, by the word", () => {
    const volume = volumeOfPages([
      tesseractPage("Okonomie"),
      tesseractPage("Aquivalent"),
      tesseractPage("Osterreicher"),
      tesseractPage("Uberproduktion"),
      tesseractPage("Uber"),
      tesseractPage("Arzte"),
      tesseractPage("Offent-"),
    ]);

    expect(volume).toContain(">Ökonomie</span>");
    expect(volume).toContain(">Äquivalent</span>");
    expect(volume).toContain(">Österreicher</span>");
    expect(volume).toContain(">Überproduktion</span>");
    expect(volume).toContain(">Über</span>");
    expect(volume).toContain(">Ärzte</span>");
    expect(volume).toContain(">Öffent-</span>");
  });

  it("reads the capital Ö the model takes for S, and a noun's capital umlaut it sets small", () => {
    const volume = volumeOfPages([
      tesseractPage("Ssterreich"),
      tesseractPage("Skonomie"),
      tesseractPage("überproduktion"),
      tesseractPage("äußerungen"),
      tesseractPage("überhaupt"),
    ]);

    expect(volume).toContain(">Österreich</span>");
    expect(volume).toContain(">Ökonomie</span>");
    expect(volume).toContain(">Überproduktion</span>");
    expect(volume).toContain(">Äußerungen</span>");
    expect(volume).toContain(">überhaupt</span>");
  });

  it("leaves the words that are spelled without an umlaut", () => {
    const volume = volumeOfPages([
      tesseractPage("Arzt"),
      tesseractPage("Außer"),
      tesseractPage("Ostern"),
      tesseractPage("Andern"),
      tesseractPage("Apfel"),
    ]);

    expect(volume).toContain(">Arzt</span>");
    expect(volume).toContain(">Außer</span>");
    expect(volume).toContain(">Ostern</span>");
    expect(volume).toContain(">Andern</span>");
    expect(volume).toContain(">Apfel</span>");
  });
});

describe("volumeOfPages, hyphens", () => {
  it("reads a word's dash or double hyphen at the line's end as its hyphen, a free-standing dash as a dash", () => {
    const volume = volumeOfPages([
      tesseractPage("alt—"),
      tesseractPage("ver⸗"),
      tesseractPage("—"),
      tesseractPage("Bour—-"),
      tesseractPage("Februar="),
      tesseractPage("Juni⸗-Insurgent"),
    ]);

    expect(volume).toContain(">alt-</span>");
    expect(volume).toContain(">ver-</span>");
    expect(volume).toContain(">—</span>");
    expect(volume).toContain(">Bour-</span>");
    expect(volume).toContain(">Februar-</span>");
    expect(volume).toContain(">Juni-Insurgent</span>");
  });

  it("reads a double hyphen that ends a word before a comma as a hyphen", () => {
    const volume = volumeOfPages([
      tesseractPage("Wechsel⸗,"),
      tesseractPage("Schiffs⸗-,"),
    ]);

    expect(volume).toContain(">Wechsel-,</span>");
    expect(volume).toContain(">Schiffs-,</span>");
  });
});

describe("preparationFor", () => {
  it("enlarges a page in grey, and straightens a page of uneven paper and sets it black on white against its surroundings", () => {
    expect(preparationFor({ binarise: false })).toEqual([
      "-colorspace",
      "Gray",
      "-resize",
      "200%",
    ]);
    expect(preparationFor({ binarise: true })).toEqual([
      "-colorspace",
      "Gray",
      "-deskew",
      "40%",
      "-resize",
      "200%",
      "-lat",
      "60x60-6%",
    ]);
  });
});

describe("createPageOcr", () => {
  let cacheDir: string;

  beforeEach(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), "book-import-ocr-"));
  });

  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  it("recognises a page again when it is prepared differently", async () => {
    const recognised: string[] = [];
    const ocrWith = (prepare: string): PageOcr =>
      createPageOcr({
        cacheDir,
        model: "frak2021",
        prepare,
        fetchImage: async () => new Uint8Array([1]),
        recognise: async () => {
          recognised.push(prepare);
          return tesseractPage(prepare);
        },
      });
    const url = "https://archive.org/download/item/page/n3_w1600.jpg";

    await ocrWith("gray 2x")(url);
    await ocrWith("gray 2x")(url);
    await ocrWith("gray 3x")(url);

    expect(recognised).toEqual(["gray 2x", "gray 3x"]);
  });

  it("recognises a page cut to its parts again when the parts are cut differently, and a whole page not", async () => {
    const recognised: string[] = [];
    const ocrWith = (cut: string): PageOcr =>
      createPageOcr({
        cacheDir,
        model: "deu",
        prepare: "gray 2x",
        cut,
        fetchImage: async () => new Uint8Array([1]),
        recognise: async () => {
          recognised.push(cut);
          return tesseractPage(cut);
        },
      });
    const whole = "https://archive.org/download/item/page/n3_w1600.jpg";
    const column = `${whole}#region=0.5,0,0.5,1`;

    await ocrWith("margin 0")(whole);
    await ocrWith("margin 40")(whole);
    await ocrWith("margin 0")(column);
    await ocrWith("margin 0")(column);
    await ocrWith("margin 40")(column);

    expect(recognised).toEqual(["margin 0", "margin 0", "margin 40"]);
  });

  it("fetches a model Tesseract lacks once, and leaves its own models to it", async () => {
    const fetched: string[] = [];
    const fetchModel = async (url: string): Promise<Uint8Array> => {
      fetched.push(url);
      return new Uint8Array([7, 7]);
    };

    const dir = await tessdataFor("frak2021", cacheDir, fetchModel);
    const again = await tessdataFor("frak2021", cacheDir, fetchModel);
    const builtIn = await tessdataFor("frk", cacheDir, fetchModel);

    expect(dir).toBe(join(cacheDir, "tessdata"));
    expect(again).toBe(dir);
    expect(builtIn).toBeNull();
    expect(fetched).toHaveLength(1);
    expect(fetched[0]).toContain("frak2021");
    expect(
      new Uint8Array(
        await Bun.file(
          join(cacheDir, "tessdata", "frak2021.traineddata"),
        ).arrayBuffer(),
      ),
    ).toEqual(new Uint8Array([7, 7]));
  });

  it("recognises a page once per model, and serves it again from the cache", async () => {
    const fetched: string[] = [];
    const recognised: string[] = [];
    const ocrWith = (model: string): PageOcr =>
      createPageOcr({
        cacheDir,
        model,
        fetchImage: async (url) => {
          fetched.push(url);
          return new Uint8Array([1, 2, 3]);
        },
        recognise: async (image, used) => {
          recognised.push(`${used}:${image.length}`);
          return tesseractPage(used);
        },
      });
    const url = "https://archive.org/download/item/page/n3_w1600.jpg";

    const first = await ocrWith("frk")(url);
    const again = await ocrWith("frk")(url);
    const other = await ocrWith("deu_frak")(url);

    expect(again).toBe(first);
    expect(other).toContain("deu_frak");
    expect(recognised).toEqual(["frk:3", "deu_frak:3"]);
    expect(fetched).toEqual([url, url]);
  });
});

describe("frakturRead", () => {
  it("reads a Fraktur OCR's long s, its etc. and its hyphens as roman type sets them", () => {
    expect(
      frakturRead(
        "<span class='ocrx_word'>Geſellſchaft</span> <span class='ocrx_word'>ꝛc.</span> <span class='ocrx_word'>ver⸗</span>",
      ),
    ).toBe(
      "<span class='ocrx_word'>Gesellschaft</span> <span class='ocrx_word'>etc.</span> <span class='ocrx_word'>ver-</span>",
    );
  });
});

describe("scanImages", () => {
  const noPdf = async (): Promise<Uint8Array> => {
    throw new Error("no PDF here");
  };
  const noCrop = async (): Promise<Uint8Array> => {
    throw new Error("nothing to cut");
  };

  it("fetches a page image as it is", async () => {
    const fetched: string[] = [];
    const image = scanImages(
      async (url) => {
        fetched.push(url);
        return new Uint8Array([1]);
      },
      noPdf,
      noCrop,
    );

    expect(
      await image("https://polona.pl/iiif/3/a/full/max/0/default.jpg"),
    ).toEqual(new Uint8Array([1]));
    expect(fetched).toEqual([
      "https://polona.pl/iiif/3/a/full/max/0/default.jpg",
    ]);
  });

  it("cuts a page image to the part the address names, as a newspaper's column", async () => {
    const fetched: string[] = [];
    const cut: string[] = [];
    const image = scanImages(
      async (url) => {
        fetched.push(url);
        return new Uint8Array([2]);
      },
      noPdf,
      async (whole, regions) => {
        cut.push(
          `${whole[0]} ${regions.map((region) => region.join(",")).join(" ")}`,
        );
        return new Uint8Array([3]);
      },
    );

    expect(
      await image(
        "https://archive.org/download/wmw/page/n3_w1600.jpg#region=0.5,0,0.5,1",
      ),
    ).toEqual(new Uint8Array([3]));
    expect(fetched).toEqual([
      "https://archive.org/download/wmw/page/n3_w1600.jpg",
    ]);
    expect(cut).toEqual(["2 0.5,0,0.5,1"]);
  });

  it("reads the parts an address names one below the other, as an article's two columns on one printed page", async () => {
    const cut: string[] = [];
    const image = scanImages(
      async () => new Uint8Array([4]),
      noPdf,
      async (whole, regions) => {
        cut.push(
          `${whole[0]} ${regions.map((region) => region.join(",")).join(" ")}`,
        );
        return new Uint8Array([5]);
      },
    );

    expect(
      await image(
        "https://archive.org/download/zukunft/page/n1_w1600.jpg#region=0.33,0.6,0.33,0.4&region=0.66,0.6,0.34,0.4",
      ),
    ).toEqual(new Uint8Array([5]));
    expect(cut).toEqual(["4 0.33,0.6,0.33,0.4 0.66,0.6,0.34,0.4"]);
  });

  it("renders a PDF's page, cut to the part the address names, fetching the PDF once", async () => {
    const fetched: string[] = [];
    const rendered: string[] = [];
    const cut: string[] = [];
    const image = scanImages(
      async (url) => {
        fetched.push(url);
        return new Uint8Array([37]);
      },
      async (pdf, page) => {
        rendered.push(`${pdf[0]} ${page}`);
        return new Uint8Array([page]);
      },
      async (whole, regions) => {
        cut.push(
          `${whole[0]} ${regions.map((region) => region.join(",")).join(" ")}`,
        );
        return new Uint8Array([99]);
      },
    );

    expect(
      await image(
        "http://iapsop.com/weekly.pdf#page=5&region=0.37,0.1,0.27,0.3",
      ),
    ).toEqual(new Uint8Array([99]));
    expect(await image("http://iapsop.com/weekly.pdf#page=6")).toEqual(
      new Uint8Array([6]),
    );
    expect(fetched).toEqual(["http://iapsop.com/weekly.pdf"]);
    expect(rendered).toEqual(["37 5", "37 6"]);
    expect(cut).toEqual(["5 0.37,0.1,0.27,0.3"]);
  });
});

describe("withGreekReadings", () => {
  interface Word {
    text: string;
    conf: number;
    left: number;
  }

  /** A line of words as Tesseract reads it, each 100 wide at its left. */
  function linePage(words: Word[]): string {
    const spans = words.map(
      (word, index) =>
        `<span class='ocrx_word' id='word_1_${index + 1}' title='bbox ${word.left} 300 ${word.left + 100} 360; x_wconf ${word.conf}'>${word.text}</span>`,
    );
    return `<html><body><div class='ocr_page' id='page_1' title='bbox 0 0 1600 2600'><span class='ocr_line' id='line_1_1' title='bbox 0 300 1600 360'>${spans.join(" ")}</span></div></body></html>`;
  }

  const texts = (hocr: string): string[] =>
    [...hocr.matchAll(/class='ocrx_word'[^>]*>([^<]*)</gu)].map(
      (match) => match[1] ?? "",
    );

  it("takes the Greek reading of words the page's model read as Latin letters", () => {
    const merged = withGreekReadings(
      linePage([
        { text: "als", conf: 92, left: 0 },
        { text: "Tm2hdyous", conf: 0, left: 200 },
        { text: "dArodupouwEvN", conf: 16, left: 400 },
      ]),
      linePage([
        { text: "αἷς", conf: 30, left: 0 },
        { text: "πελάγους", conf: 91, left: 200 },
        { text: "ἀποδυρομένη", conf: 89, left: 400 },
      ]),
    );

    expect(texts(merged)).toEqual(["als", "πελάγους", "ἀποδυρομένη"]);
  });

  it("reads a Greek word once where the page's model split it in two", () => {
    const greek = linePage([{ text: "κέλομαι", conf: 88, left: 0 }]).replace(
      "bbox 0 300 100 360",
      "bbox 0 300 200 360",
    );
    const merged = withGreekReadings(
      linePage([
        { text: "xé", conf: 20, left: 0 },
        { text: "Aowaı", conf: 10, left: 100 },
      ]),
      greek,
    );

    expect(texts(merged).filter((text) => text !== "")).toEqual(["κέλομαι"]);
  });

  it("keeps a word the page's model reads surer than the Greek one", () => {
    const merged = withGreekReadings(
      linePage([{ text: "Gedicht,", conf: 89, left: 0 }]),
      linePage([{ text: "(σϑαϊοπί,", conf: 7, left: 0 }]),
    );

    expect(texts(merged)).toEqual(["Gedicht,"]);
  });

  it("keeps a word whose Greek reading is unsure, however unsure the page's model", () => {
    const merged = withGreekReadings(
      linePage([{ text: "'ganze", conf: 0, left: 0 }]),
      linePage([{ text: "σᾶηΖε", conf: 17, left: 0 }]),
    );

    expect(texts(merged)).toEqual(["'ganze"]);
  });

  it("keeps a word whose Greek reading holds figures, which no Greek word does", () => {
    const merged = withGreekReadings(
      linePage([{ text: "Sseine", conf: 30, left: 0 }]),
      linePage([{ text: "561η6", conf: 70, left: 0 }]),
    );

    expect(texts(merged)).toEqual(["Sseine"]);
  });

  it("keeps a word the Greek model reads only in letters both scripts print alike", () => {
    // A heading's numeral I. the page's model misread as IT, and XXIII.
    const merged = withGreekReadings(
      linePage([
        { text: "IT", conf: 30, left: 0 },
        { text: "XXIIL", conf: 37, left: 200 },
      ]),
      linePage([
        { text: "Ι.", conf: 95, left: 0 },
        { text: "ΧΧΙΙΙ", conf: 86, left: 200 },
      ]),
    );

    expect(texts(merged)).toEqual(["IT", "XXIIL"]);
  });

  it("keeps a section sign, which no Greek word holds", () => {
    const merged = withGreekReadings(
      linePage([{ text: "[§", conf: 40, left: 0 }]),
      linePage([{ text: "[ξ", conf: 90, left: 0 }]),
    );

    expect(texts(merged)).toEqual(["[§"]);
  });

  it("keeps a word the Greek model reads as no Greek", () => {
    const merged = withGreekReadings(
      linePage([{ text: "1868.", conf: 40, left: 0 }]),
      linePage([{ text: "1868.", conf: 90, left: 0 }]),
    );

    expect(texts(merged)).toEqual(["1868."]);
  });
});
