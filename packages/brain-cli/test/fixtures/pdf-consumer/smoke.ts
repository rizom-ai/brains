import assert from "node:assert/strict";
import type * as PdfJs from "pdfjs-dist/legacy/build/pdf.mjs";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const brainEntry = fileURLToPath(import.meta.resolve("@rizom/brain"));
const dist = dirname(brainEntry);
const manifest: unknown = JSON.parse(
  await readFile(join(dist, "../package.json"), "utf8"),
);
assert.ok(
  typeof manifest === "object" &&
    manifest !== null &&
    "dependencies" in manifest,
);
const dependencies = manifest.dependencies;
assert.ok(
  typeof dependencies === "object" &&
    dependencies !== null &&
    "pdfjs-dist" in dependencies,
);
assert.equal(typeof dependencies["pdfjs-dist"], "string");
const externalImport = /import\(["']pdfjs-dist\/legacy\/build\/pdf\.mjs["']\)/;
assert.match(await readFile(join(dist, "brain.js"), "utf8"), externalImport);
const libraries = (await readdir(dist, { recursive: true })).filter(
  (path) => path.endsWith(".js") && path !== "brain.js",
);
assert.ok(
  (
    await Promise.all(
      libraries.map((path) => readFile(join(dist, path), "utf8")),
    )
  ).some((source) => externalImport.test(source)),
);

// Resolve through the installed owner, not this fixture or a workspace path.
// No worker override or global polyfill: the dependency must bring its assets
// and native optional dependency to the standalone installation itself.
const ownerRequire = createRequire(brainEntry);
const pdfEntry = ownerRequire.resolve("pdfjs-dist/legacy/build/pdf.mjs");
const withinConsumer = relative(process.cwd(), pdfEntry);
assert.ok(!withinConsumer.startsWith("..") && !isAbsolute(withinConsumer));
const pdfjs: typeof PdfJs = await import(pathToFileURL(pdfEntry).href);

const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
  "",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
];
const text = "BT /F1 12 Tf 72 720 Td (Packed PDF extraction) Tj ET";
objects[3] = `<< /Length ${text.length} >>\nstream\n${text}\nendstream`;
let source = "%PDF-1.7\n";
const offsets = [];
for (const [index, object] of objects.entries()) {
  offsets.push(source.length);
  source += `${index + 1} 0 obj\n${object}\nendobj\n`;
}
const xref = source.length;
source += `xref\n0 6\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}`;
source += `trailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n${xref}\n%%EOF\n`;
const bytes = new Uint8Array(Buffer.from(source));
for (let run = 0; run < 2; run++) {
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    disableFontFace: false,
    useSystemFonts: true,
    useWorkerFetch: false,
  });
  try {
    const document = await task.promise;
    assert.equal(document.numPages, 1);
    const page = await document.getPage(1);
    const content = await page.getTextContent();
    assert.equal(
      content.items
        .flatMap((item) => ("str" in item ? [item.str] : []))
        .join(" "),
      "Packed PDF extraction",
    );
  } finally {
    await task.destroy();
  }
}
console.log(`packed-pdf-extraction-ok:${pdfjs.version}`);
