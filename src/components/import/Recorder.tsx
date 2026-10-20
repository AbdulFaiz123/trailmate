"use client";

import { useEffect, useRef, useState } from "react";

const MAX_SECONDS = 120;

/** Record a voice message with the phone's microphone (MediaRecorder). */
export function Recorder({ onDone, disabled }: { onDone: (audio: File) => void; disabled?: boolean }) {
  const [state, setState] = useState<"idle" | "recording" | "denied" | "unsupported">("idle");
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined")) setState("unsupported");
    return () => {
      if (timer.current) clearInterval(timer.current);
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Chrome/Android record webm, Safari/iPhone record mp4.
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const type = (rec.mimeType || "audio/webm").split(";")[0];
        onDone(new File(chunks, `voice.${type.includes("mp4") ? "m4a" : "webm"}`, { type }));
      };
      rec.start();
      recorder.current = rec;
      setSeconds(0);
      setState("recording");
      timer.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_SECONDS) stop();
          return s + 1;
        });
      }, 1000);
    } catch {
      setState("denied");
    }
  }

  function stop() {
    if (timer.current) clearInterval(timer.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
    setState("idle");
  }

  if (state === "unsupported") return <p className="text-xs text-muted">This browser can’t record audio. Pick an audio file instead.</p>;
  return (
    <div className="space-y-2 text-center">
      <button
        type="button"
        disabled={disabled}
        onClick={state === "recording" ? stop : start}
        aria-label={state === "recording" ? "Stop recording" : "Start recording"}
        className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full text-3xl text-white shadow disabled:opacity-50 ${state === "recording" ? "animate-pulse bg-red-600" : "bg-accent"}`}
      >
        {state === "recording" ? "■" : "🎤"}
      </button>
      <p className="text-xs text-muted">
        {state === "recording"
          ? `Recording… ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} — tap to stop`
          : state === "denied"
            ? "Microphone blocked. Allow it in the browser’s site settings, or pick an audio file."
            : "Tap and say what you booked or need, e.g. “ICE 597 from Berlin to Frankfurt on the 27th at 9:51, and buy chocolates for Mom.”"}
      </p>
    </div>
  );
}
