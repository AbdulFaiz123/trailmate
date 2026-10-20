import { NextResponse } from "next/server";
import { runImport, type ImportRequest } from "@/server/ai/import";
import { ImportError } from "@/server/ai/types";
import { MAX_UPLOAD_BYTES, detectType } from "@/server/storage";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // OpenAI's transcription limit
const AUDIO_TYPES = ["audio/webm", "audio/mp4", "audio/mpeg", "audio/mp3", "audio/m4a", "audio/x-m4a", "audio/wav", "audio/x-wav", "audio/ogg", "video/webm", "video/mp4"];

/** Read a voice message, photo, PDF or pasted text into a draft. Saves nothing. */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Expected a form" }, { status: 400 });
  // No tripId + newTrip=1: the traveler is creating a trip from this input.
  const tripId = String(form.get("tripId") ?? "") || null;
  if (!tripId && form.get("newTrip") !== "1") return NextResponse.json({ error: "Missing trip" }, { status: 400 });
  const mode = String(form.get("mode") ?? "");
  const file = form.get("file");

  let request: ImportRequest;
  try {
    if (mode === "text") {
      const text = String(form.get("text") ?? "").trim();
      if (!text) return NextResponse.json({ error: "Paste some text first" }, { status: 400 });
      if (text.length > 20_000) return NextResponse.json({ error: "That's a lot of text — paste up to 20,000 characters" }, { status: 413 });
      request = { kind: "text", text };
    } else if (mode === "demo") {
      const demo = String(form.get("demo") ?? "");
      if (demo !== "receipt" && demo !== "voice") return NextResponse.json({ error: "Unknown demo" }, { status: 400 });
      request = { kind: "demo", demo };
    } else if (mode === "file" || mode === "audio") {
      if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Choose a file" }, { status: 400 });
      const bytes = Buffer.from(await file.arrayBuffer());
      if (mode === "audio") {
        if (bytes.length > MAX_AUDIO_BYTES) return NextResponse.json({ error: "Recordings can be up to 25 MB" }, { status: 413 });
        const type = file.type.split(";")[0];
        if (!AUDIO_TYPES.includes(type)) return NextResponse.json({ error: `Unsupported audio type (${type || "unknown"})` }, { status: 415 });
        request = { kind: "audio", bytes, mimeType: type, fileName: file.name || "voice.webm" };
      } else {
        if (bytes.length > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Files can be up to 15 MB" }, { status: 413 });
        const mimeType = detectType(bytes, file.type);
        if (!mimeType || mimeType === "image/heic") {
          return NextResponse.json({ error: mimeType ? "HEIC photos can't be read yet — share it as JPG" : "Use a PDF, JPG, PNG or WebP" }, { status: 415 });
        }
        request = { kind: "file", bytes, mimeType, fileName: file.name || "upload" };
      }
    } else {
      return NextResponse.json({ error: "Unknown import mode" }, { status: 400 });
    }

    return NextResponse.json(await runImport(tripId, request));
  } catch (e) {
    if (e instanceof ImportError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[import]", e);
    return NextResponse.json({ error: "Something went wrong reading that. Try again." }, { status: 500 });
  }
}
