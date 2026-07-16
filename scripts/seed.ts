import JSZip from "jszip";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const chapters = [
  ["chapter-1.xhtml", "I. Down the Rabbit-Hole", [
    "Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do.",
    "Once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it, ‘and what is the use of a book,’ thought Alice, ‘without pictures or conversations?’",
    "So she was considering in her own mind whether the pleasure of making a daisy-chain would be worth the trouble of getting up and picking the daisies, when suddenly a White Rabbit with pink eyes ran close by her.",
    "There was nothing so very remarkable in that; nor did Alice think it so very much out of the way to hear the Rabbit say to itself, ‘Oh dear! Oh dear! I shall be late!’",
    "But when the Rabbit actually took a watch out of its waistcoat-pocket, and looked at it, and then hurried on, Alice started to her feet."
  ]],
  ["chapter-2.xhtml", "II. The Pool of Tears", [
    "‘Curiouser and curiouser!’ cried Alice (she was so much surprised, that for the moment she quite forgot how to speak good English).",
    "Now I’m opening out like the largest telescope that ever was! Good-bye, feet!",
    "She began to cry again, and went on shedding gallons of tears, until there was a large pool all round her."
  ]],
  ["chapter-3.xhtml", "III. A Caucus-Race and a Long Tale", [
    "They were indeed a queer-looking party that assembled on the bank—the birds with draggled feathers, the animals with their fur clinging close to them, and all dripping wet, cross, and uncomfortable.",
    "The first question of course was, how to get dry again: they had a consultation about this, and after a few minutes it seemed quite natural to Alice to find herself talking familiarly with them.",
    "The Dodo solemnly presented the thimble, saying ‘We beg your acceptance of this elegant thimble’; and, when it had finished this short speech, they all cheered."
  ]],
  ["chapter-4.xhtml", "IV. The Rabbit Sends in a Little Bill", [
    "It was the White Rabbit, trotting slowly back again, and looking anxiously about as it went, as if it had lost something.",
    "Very soon the Rabbit noticed Alice, as she went hunting about, and called out to her in an angry tone, ‘Why, Mary Ann, what are you doing out here?’",
    "This was the answer hidden beyond the seeded reading position: the little creature sent Bill down the chimney, and Alice gave one sharp kick."
  ]]
] as const;

function xhtml(title: string, paragraphs: readonly string[]) {
  return `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>${title}</title><link rel="stylesheet" href="../styles/book.css"/></head><body><article><h1>${title}</h1>${paragraphs.map((text, index) => `<p id="p-${index}">${text}</p>`).join("")}</article></body></html>`;
}

async function buildEpub() {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file("META-INF/container.xml", `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
  zip.file("EPUB/styles/book.css", "body{font-family:serif;line-height:1.65}h1{font-weight:500}p{margin:0 0 1.2em}");
  for (const [file, title, paragraphs] of chapters) zip.file(`EPUB/text/${file}`, xhtml(title, paragraphs));
  zip.file("EPUB/nav.xhtml", `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><h1>Contents</h1><ol>${chapters.map(([file, title]) => `<li><a href="text/${file}">${title}</a></li>`).join("")}</ol></nav></body></html>`);
  zip.file("EPUB/package.opf", `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">margin-reader-alice-demo</dc:identifier><dc:title>Alice’s Adventures in Wonderland</dc:title><dc:creator>Lewis Carroll</dc:creator><dc:language>en</dc:language><meta property="dcterms:modified">2026-01-01T00:00:00Z</meta></metadata><manifest>${chapters.map(([file], index) => `<item id="ch${index + 1}" href="text/${file}" media-type="application/xhtml+xml"/>`).join("")}<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="styles/book.css" media-type="text/css"/></manifest><spine>${chapters.map((_, index) => `<itemref idref="ch${index + 1}"/>`).join("")}</spine></package>`);
  const bytes = await zip.generateAsync({ type: "uint8array", mimeType: "application/epub+zip", compression: "DEFLATE", compressionOptions: { level: 6 } });
  const output = path.join(process.cwd(), "public", "books");
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, "alice.epub"), bytes);
  return bytes.byteLength;
}

async function main() {
  const size = await buildEpub();
  console.log(`Seeded public/books/alice.epub (${size} bytes).`);
  console.log("Import the fixture with Cmd+O while the desktop app is running.");
}

main().catch((error: unknown) => { console.error(error); process.exit(1); });
