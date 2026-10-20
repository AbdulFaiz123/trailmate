// A small lookup of places -> IANA time zone, to fill gaps in imported data
// ("Frankfurt" -> Europe/Berlin). Extend freely.
const ZONES: [RegExp, string][] = [
  [/\b(berlin|frankfurt|m[uü]nchen|munich|hamburg|k[oö]ln|cologne|d[uü]sseldorf|stuttgart|leipzig|dresden|hannover|nuremberg|n[uü]rnberg|bonn|mainz|ber|fra|muc|ham|dus|str|cgn)\b/i, "Europe/Berlin"],
  [/\b(paris|lyon|cdg|ory)\b/i, "Europe/Paris"],
  [/\b(amsterdam|ams|schiphol)\b/i, "Europe/Amsterdam"],
  [/\b(vienna|wien|vie)\b/i, "Europe/Vienna"],
  [/\b(z[uü]rich|zrh|geneva|gva)\b/i, "Europe/Zurich"],
  [/\b(london|lhr|lgw|heathrow|gatwick)\b/i, "Europe/London"],
  [/\b(istanbul|ist)\b/i, "Europe/Istanbul"],
  [/\b(dubai|dxb)\b/i, "Asia/Dubai"],
  [/\b(doha|doh)\b/i, "Asia/Qatar"],
  [/\b(abu dhabi|auh)\b/i, "Asia/Dubai"],
  [/\b(hyderabad|secunderabad|shamshabad|banjara|hyd|delhi|new delhi|del|mumbai|bombay|bom|bengaluru|bangalore|blr|chennai|maa|kolkata|ccu|pune|pnq|goa|goi|kochi|cok|ahmedabad|amd|jaipur|jai|vijayawada|bza|visakhapatnam|vizag|vtz|tirupati|warangal|lucknow|lko|agra|varanasi|vns|amritsar|atq|udaipur|mysuru|mysore|coimbatore|cjb|madurai|ixm|thiruvananthapuram|trivandrum|trv|nagpur|nag|bhopal|indore|idr|patna|pat|guwahati|gau|bhubaneswar|bbi|chandigarh|ixc|srinagar|sxr|india)\b/i, "Asia/Kolkata"],
  [/\b(new york|jfk|ewr|newark)\b/i, "America/New_York"],
];

export function guessZone(place: string | null | undefined): string | null {
  if (!place) return null;
  return ZONES.find(([re]) => re.test(place))?.[1] ?? null;
}
