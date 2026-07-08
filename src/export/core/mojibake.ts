// Répare le mojibake classique « UTF-8 relu comme Latin-1/Windows-1252 »
// (ex. "Séance" devenu "SÃ©ance") : un LLM ou une étape de copier-coller /
// sauvegarde peut réinterpréter les octets UTF-8 comme des caractères Latin-1,
// ce qui casse tous les accents (en-têtes ET données). C'est réversible tant
// que chaque caractère du texte corrompu tient sur un octet (0-255) : on
// réinterprète ces codes comme des octets et on les redécode en UTF-8.
// Sans effet sur du texte déjà correct (le redécodage échoue alors, car un
// accent correctement décodé n'est plus une séquence UTF-8 valide isolée).

const HAS_LATIN1_RANGE_CHAR = /[-ÿ]/;

export function fixMojibake(input: string): string {
  let s = input;
  // Plusieurs passes : une copie/sauvegarde supplémentaire peut corrompre une
  // seconde fois un texte déjà mojibaké.
  for (let i = 0; i < 4; i++) {
    if (!HAS_LATIN1_RANGE_CHAR.test(s)) break; // que de l'ASCII : rien à tenter
    const codes = Array.from(s, (ch) => ch.codePointAt(0)!);
    if (codes.some((c) => c > 0xff)) break; // hors Latin-1 : pas ce type de mojibake
    let decoded: string;
    try {
      decoded = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(codes));
    } catch {
      break; // pas une séquence UTF-8 valide : le texte est déjà correct
    }
    if (decoded === s) break;
    s = decoded;
  }
  return s;
}
