/**
 * Reduces a voice's reported name to just its proper name.
 *
 * Piper reports names like "Ryan (EN_US) - High". The picker shows that in
 * full, but reading it aloud turns "Ryan" into "Ryan bracket E N underscore
 * U S bracket High", so the spoken preview uses the bare name.
 *
 *   "Ryan (EN_US) - High" -> "Ryan"
 *   "Samantha"            -> "Samantha"
 */
export function displayVoiceName(name: string): string {
  return name
    .split("(")[0]
    .split(" - ")[0]
    .trim();
}
