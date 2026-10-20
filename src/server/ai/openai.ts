// OpenAI adapter for smart import (raw HTTPS, no SDK).
//   - Responses API with Structured Outputs: the reply must match our JSON schema
//   - images as input_image (base64 data URL), PDFs as input_file
//   - voice via /v1/audio/transcriptions (gpt-transcribe)
// Docs: developers.openai.com/api/docs/guides/structured-outputs, /pdf-files,
//       /images-vision, /speech-to-text
import { DRAFT_JSON_SCHEMA, type ImportDraft } from "@/lib/import/draft";
import { instructions } from "./prompt";
import { ImportError, type ImportContext, type ImportInput, type ImportParser } from "./types";

const BASE = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

type ResponsesReply = {
  status?: string;
  incomplete_details?: { reason?: string } | null;
  error?: { message?: string } | null;
  output?: { type: string; content?: { type: string; text?: string; refusal?: string }[] }[];
};

async function call(path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new ImportError("OpenAI isn't set up (OPENAI_API_KEY missing).", 503);
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        ...init,
        headers: { authorization: `Bearer ${key}`, ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return res;
      // Errors worth a retry: rate limit and server hiccups.
      if ((res.status === 429 || res.status >= 500) && attempt === 0) {
        await new Promise((r) => setTimeout(r, 1_500));
        continue;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: string } };
      if (res.status === 401) throw new ImportError("OpenAI rejected the API key. Check OPENAI_API_KEY in .env.", 502);
      if (res.status === 429) throw new ImportError("OpenAI says: too many requests or no credit left on the account. Try again later.", 502);
      throw new ImportError(`OpenAI error ${res.status}: ${body.error?.message ?? "unknown"}`, 502);
    } catch (e) {
      if (e instanceof ImportError) throw e;
      last = e;
      if (attempt === 0) continue;
    }
  }
  const timedOut = (last as Error)?.name === "TimeoutError";
  throw new ImportError(timedOut ? "OpenAI took too long to answer. Try again." : "Couldn't reach OpenAI. Check your connection.", 504);
}

export class OpenAIParser implements ImportParser {
  readonly name = "openai";

  constructor(
    private readonly model = process.env.OPENAI_MODEL || "gpt-6.1-sol",
    private readonly transcribeModel = process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-transcribe",
  ) {}

  async parse(input: ImportInput, ctx: ImportContext): Promise<ImportDraft> {
    const content =
      input.kind === "text"
        ? [{ type: "input_text", text: `Traveler's text:\n"""\n${input.text}\n"""` }]
        : input.mimeType === "application/pdf"
          ? [
              { type: "input_file", filename: input.fileName, file_data: `data:application/pdf;base64,${input.bytes.toString("base64")}` },
              { type: "input_text", text: "Extract the trip data from this document." },
            ]
          : [
              { type: "input_image", image_url: `data:${input.mimeType};base64,${input.bytes.toString("base64")}`, detail: "high" },
              { type: "input_text", text: "Extract the trip data from this photo (ticket, booking or receipt)." },
            ];

    const res = await call(
      "/responses",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          instructions: instructions(ctx),
          input: [{ role: "user", content }],
          text: { format: { type: "json_schema", name: "trip_import", schema: DRAFT_JSON_SCHEMA, strict: true } },
          store: false, // don't keep the traveler's documents on OpenAI's side
        }),
      },
      input.kind === "text" ? 45_000 : 90_000,
    );
    const data = (await res.json()) as ResponsesReply;
    if (data.status === "incomplete") throw new ImportError(`OpenAI stopped early (${data.incomplete_details?.reason ?? "incomplete"}). Try a smaller file.`);
    const parts = data.output?.find((o) => o.type === "message")?.content ?? [];
    const refusal = parts.find((p) => p.type === "refusal");
    if (refusal) throw new ImportError(`OpenAI declined: ${refusal.refusal}`, 422);
    const text = parts.find((p) => p.type === "output_text")?.text;
    if (!text) throw new ImportError("OpenAI sent an empty answer.");
    try {
      return JSON.parse(text) as ImportDraft;
    } catch {
      throw new ImportError("OpenAI's answer wasn't valid JSON.");
    }
  }

  async transcribe(audio: Buffer, mimeType: string, fileName: string): Promise<string> {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(audio)], { type: mimeType }), fileName);
    form.append("model", this.transcribeModel);
    form.append("response_format", "json");
    const res = await call("/audio/transcriptions", { method: "POST", body: form }, 90_000);
    const data = (await res.json()) as { text?: string };
    if (!data.text?.trim()) throw new ImportError("Couldn't hear anything in that recording.", 422);
    return data.text.trim();
  }
}
