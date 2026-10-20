// Placeholder files for the demo documents vault. Deliberately plain and
// stamped "SAMPLE", so nobody mistakes them for real tickets.
import sharp from "sharp";

/** A one-page PDF with lines of text. Builds the file by hand: objects + byte offsets. */
export function samplePdf(title: string, lines: string[]): Buffer {
  const esc = (s: string) => s.replace(/[\\()]/g, "\\$&");
  const text = [
    "BT", "/F1 22 Tf", "56 770 Td", `(${esc(title)}) Tj`,
    "/F1 12 Tf", "0 -30 Td", "(SAMPLE DOCUMENT - Trailmate demo data. Not a real ticket or booking.) Tj",
    ...lines.flatMap((l) => ["0 -22 Td", `(${esc(l)}) Tj`]),
    "ET",
    // a light border so it reads as a "document"
    "0.6 0.6 0.6 RG 40 40 515 762 re S",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(text, "latin1")} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

/** A PNG "card" with a title and a few lines. */
export async function samplePng(title: string, lines: string[]): Promise<Buffer> {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="620">
    <rect width="1000" height="620" rx="36" fill="#f6f7f5" stroke="#9aa59f" stroke-width="4"/>
    <text x="60" y="110" font-family="Helvetica, Arial" font-size="50" font-weight="700" fill="#15201b">${esc(title)}</text>
    <text x="60" y="170" font-family="Helvetica, Arial" font-size="26" fill="#b45309">SAMPLE - Trailmate demo data, not a real document</text>
    ${lines.map((l, i) => `<text x="60" y="${250 + i * 54}" font-family="Helvetica, Arial" font-size="32" fill="#15201b">${esc(l)}</text>`).join("")}
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
