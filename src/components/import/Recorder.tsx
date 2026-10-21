"use client";

import { useVoiceRecorder } from "./useVoiceRecorder";

/** The big round record button on the Import screen. */
export function Recorder({ onDone, disabled, hint }: { onDone: (audio: File) => void; disabled?: boolean; hint?: string }) {
  const { state, clock, toggle } = useVoiceRecorder(onDone);

  if (state === "unsupported") return <p className="text-xs text-muted">This browser can’t record audio. Pick an audio file instead.</p>;
  return (
    <div className="space-y-2 text-center">
      <button
        type="button"
        disabled={disabled}
        onClick={toggle}
        aria-label={state === "recording" ? "Stop recording" : "Start recording"}
        className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full text-3xl text-white shadow disabled:opacity-50 ${state === "recording" ? "animate-pulse bg-red-600" : "bg-accent"}`}
      >
        {state === "recording" ? "■" : "🎤"}
      </button>
      <p className="text-xs text-muted">
        {state === "recording"
          ? `Recording… ${clock} — tap to stop`
          : state === "denied"
            ? "Microphone blocked. Allow it in the browser’s site settings, or pick an audio file."
            : hint ?? "Tap and say what you booked or need, e.g. “ICE 597 from Berlin to Frankfurt on the 27th at 9:51, and buy chocolates for Mom.”"}
      </p>
    </div>
  );
}
