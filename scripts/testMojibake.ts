// Test PC de la réparation du mojibake (UTF-8 relu comme Latin-1/Windows-1252).
//   npx tsx scripts/testMojibake.ts

import { fixMojibake } from '../src/export/core/mojibake';

let failures = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  if (actual === expected) {
    console.log(`✅ ${msg}`);
  } else {
    failures++;
    console.error(`❌ ${msg}\n    attendu: ${JSON.stringify(expected)}\n    obtenu : ${JSON.stringify(actual)}`);
  }
}

// Simule la corruption « UTF-8 relu comme Latin-1 » : chaque octet UTF-8
// devient un caractère JS distinct.
function mojibake(s: string): string {
  const bytes = new TextEncoder().encode(s);
  return Array.from(bytes, (b) => String.fromCharCode(b)).join('');
}

const orig = 'Séance : Développé couché, tirage à la poulie, gainage — 3×10.';

eq(fixMojibake(mojibake(orig)), orig, 'corruption simple réparée');
eq(fixMojibake(mojibake(mojibake(orig))), orig, 'double corruption réparée');
eq(fixMojibake(orig), orig, 'texte déjà correct : inchangé');
eq(fixMojibake('Push Pull Legs'), 'Push Pull Legs', 'ASCII pur : inchangé');
eq(fixMojibake(''), '', 'chaîne vide : inchangée');

if (failures) {
  console.error(`\n❌ ${failures} test(s) échoué(s).`);
  process.exit(1);
} else {
  console.log('\n✅ Tous les tests mojibake OK.');
}
