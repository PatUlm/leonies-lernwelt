/**
 * German text as it is spoken: the same for the device voice and the server
 * recordings, which are looked up by it. Speech engines read "7:30" in their
 * own way ("halb sieben"), so times become "7 Uhr 30". Arithmetic signs
 * between numbers are said in words: "90 − 23 = 67" → "90 minus 23 gleich 67".
 */

const HOUR_WORDS = ['null', 'ein', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf'];

export function spokenGerman(text: string): string {
  return text
    .replace(/\b(\d{1,2}):(\d{2})(?: Uhr\b)?/g, (_, h: string, m: string) => (m === '00' ? `${Number(h)} Uhr` : `${Number(h)} Uhr ${Number(m)}`))
    // "3 Uhr – drei Uhr" says the same twice.
    .replace(/\b(\d{1,2}) Uhr – (\p{L}+) Uhr\b/gu, (all, h: string, word: string) =>
      HOUR_WORDS[Number(h)] === word.toLowerCase() || (h === '1' && word.toLowerCase() === 'eins') ? `${h} Uhr` : all)
    // Only the minus sign (U+2212): the dash "–" of the clock stays a pause.
    .replace(/(?<=\d) ([−+=]) (?=\d)/g, (_, sign: string) => ` ${{ '−': 'minus', '+': 'plus', '=': 'gleich' }[sign]} `)
    .replace(/\s+/g, ' ')
    .trim();
}
