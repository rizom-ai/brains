import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPageOcr, volumeOfPages, type PageOcr } from "../src/page-ocr";

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
  it("numbers each page by its leaf and reads the long s as s", () => {
    const volume = volumeOfPages([
      tesseractPage("Geſellſchaft"),
      tesseractPage("Klaſſen"),
    ]);

    expect(volume.match(/<div class='ocr_page' id='page_\d+'/g)).toEqual([
      "<div class='ocr_page' id='page_0'",
      "<div class='ocr_page' id='page_1'",
    ]);
    expect(volume).toContain("Gesellschaft");
    expect(volume).toContain("Klassen");
    expect(volume).not.toContain("ſ");
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
