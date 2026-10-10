import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createPageOcr,
  tessdataFor,
  volumeOfPages,
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

describe("volumeOfPages, capital umlauts", () => {
  it("dots the capital umlauts the Fraktur model reads without them, by the word", () => {
    const volume = volumeOfPages([
      tesseractPage("Okonomie"),
      tesseractPage("Aquivalent"),
      tesseractPage("Osterreicher"),
      tesseractPage("Uberproduktion"),
      tesseractPage("Uber"),
      tesseractPage("Arzte"),
    ]);

    expect(volume).toContain(">Ökonomie</span>");
    expect(volume).toContain(">Äquivalent</span>");
    expect(volume).toContain(">Österreicher</span>");
    expect(volume).toContain(">Überproduktion</span>");
    expect(volume).toContain(">Über</span>");
    expect(volume).toContain(">Ärzte</span>");
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
