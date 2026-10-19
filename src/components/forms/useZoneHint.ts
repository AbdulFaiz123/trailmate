"use client";

import { useState } from "react";
import { fromLocalInput, isValidTimeZone, utcOffsetLabel } from "@/lib/time";

/**
 * Track a time zone field (and the date typed next to it) and describe it,
 * e.g. "Local time in Europe/Berlin (UTC+1)".
 *
 * The offset depends on the *date*: Berlin is UTC+2 in summer and UTC+1 in
 * winter, so we compute it for the date the user typed, not for today.
 */
export function useZoneHint(initialZone: string | undefined, initialDate: string | undefined) {
  const [tz, setTz] = useState(initialZone ?? "");
  const [date, setDate] = useState(initialDate ?? "");

  let hint = "Pick the time zone first";
  if (tz && isValidTimeZone(tz)) {
    const at = date ? fromLocalInput(date, tz) : new Date();
    hint = `Local time in ${tz} (${utcOffsetLabel(Number.isNaN(at.getTime()) ? new Date() : at, tz)})`;
  }
  return {
    hint,
    onZoneChange: (e: React.ChangeEvent<HTMLInputElement>) => setTz(e.target.value),
    onDateChange: (e: React.ChangeEvent<HTMLInputElement>) => setDate(e.target.value),
  };
}
