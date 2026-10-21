// Public demo mode (DEMO_MODE=1), for the free online showcase:
//  - no passphrase: anyone can look around
//  - sample data only, recreated every time the server starts
//  - document uploads off, so strangers can't store files on the server
//  - smart import uses the built-in demos (set IMPORT_MODE=mock), so no AI bill
// Your own copy (DEMO_MODE unset) is unaffected.
export function isDemo(env: Record<string, string | undefined> = process.env): boolean {
  return env.DEMO_MODE === "1";
}
