import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { cleanDraftText } from "@/lib/draft-text";
import fontkit from "@pdf-lib/fontkit";
import type { JourneyArtifact } from "@/types/journey";

export async function recoveryPacketPdf(
  artifact: JourneyArtifact,
  attachments: { id: string; type: string; bytes?: Uint8Array; simulated: boolean }[],
  fontBytes?: Uint8Array,
) {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Cascadia Aid: recovery packet");
  pdf.setSubject("Prepared materials, not an official form or submission");
  pdf.registerFontkit(fontkit);
  const font = fontBytes
    ? await pdf.embedFont(fontBytes, { subset: true })
    : await pdf.embedFont(StandardFonts.Helvetica);
  const safe = (value: string) =>
    [...value]
      .map((character) => {
        try {
          font.encodeText(character);
          return character;
        } catch {
          return `[U+${character.codePointAt(0)!.toString(16).toUpperCase()}]`;
        }
      })
      .join("");
  let page = pdf.addPage([612, 792]);
  let y = 738;
  const nextPage = () => {
    page = pdf.addPage([612, 792]);
    y = 738;
  };
  const line = (value: string, size = 11) => {
    if (y < 62) nextPage();
    page.drawText(safe(value), { x: 48, y, size, font, color: rgb(0.12, 0.19, 0.22) });
    y -= size + 6;
  };
  line("CASCADIA AID", 18);
  line(
    artifact.simulated
      ? "DEMONSTRATION: simulated records / delivery"
      : "Prepared materials: not submitted",
    10,
  );
  line(`Packet version ${artifact.version} | ${artifact.preparedAt.slice(0, 10)}`, 9);
  y -= 12;
  const wrap = (paragraph: string) => {
    let current = "";
    for (const word of safe(paragraph).split(/\s+/)) {
      if (!word) continue;
      if (current && font.widthOfTextAtSize(`${current} ${word}`, 11) > 510) {
        line(current);
        current = "";
      }
      // Long references wrap by character only when a whole word cannot fit.
      if (font.widthOfTextAtSize(word, 11) > 510) {
        if (current) {
          line(current);
          current = "";
        }
        for (const character of word) {
          if (font.widthOfTextAtSize(current + character, 11) > 510) {
            line(current);
            current = "";
          }
          current += character;
        }
      } else current += `${current ? " " : ""}${word}`;
    }
    line(current);
  };
  for (const paragraph of cleanDraftText(artifact.text).split(/\r?\n/)) wrap(paragraph);
  nextPage();
  line("Supporting documents", 16);
  if (!attachments.length) line("No attachments selected.");
  for (const doc of attachments) {
    wrap(`${doc.type}: ${doc.id}${doc.simulated ? ": SIMULATED" : ""}`);
    if (doc.bytes) {
      const image = await pdf.embedJpg(doc.bytes);
      nextPage();
      line(doc.type, 14);
      line(`Document reference: ${doc.id}`, 8);
      const fitted = image.scaleToFit(516, 620);
      page.drawImage(image, {
        x: (612 - fitted.width) / 2,
        y: 60 + (620 - fitted.height) / 2,
        width: fitted.width,
        height: fitted.height,
      });
      await pdf.attach(doc.bytes, `${doc.id}.jpg`, { mimeType: "image/jpeg" });
      if (doc !== attachments[attachments.length - 1]) nextPage();
    } else
      wrap("Fictional evidence reference for demonstration only; no agency document is attached.");
  }
  // Preserve exact Unicode source, including glyphs unavailable in the display font.
  await pdf.attach(
    new TextEncoder().encode(cleanDraftText(artifact.text)),
    "packet-original-text.txt",
    {
      mimeType: "text/plain;charset=utf-8",
    },
  );
  const pages = pdf.getPages();
  pages.forEach((p, index) =>
    p.drawText(`Prepared materials | Page ${index + 1} of ${pages.length}`, {
      x: 48,
      y: 30,
      size: 8,
      font,
      color: rgb(0.4, 0.45, 0.5),
    }),
  );
  return pdf.save();
}
export function recoveryCalendar(id: string, title: string, date: string, note: string) {
  const escape = (text: string) =>
    text.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)))
    throw new Error("Invalid calendar date.");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Cascadia Aid//Recovery//EN",
    "BEGIN:VEVENT",
    `UID:${escape(id)}@cascadiaaid`,
    `DTSTAMP:${new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "")}`,
    `DTSTART;VALUE=DATE:${date.replaceAll("-", "")}`,
    `SUMMARY:${escape(title)}`,
    `DESCRIPTION:${escape(note)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  // Fold by UTF-8 octets so multi-byte names do not produce invalid calendars.
  return (
    lines
      .map((line) => {
        let folded = "",
          part = "";
        for (const c of line) {
          if (new TextEncoder().encode(part + c).length > 73) {
            folded += part + "\r\n ";
            part = "";
          }
          part += c;
        }
        return folded + part;
      })
      .join("\r\n") + "\r\n"
  );
}
