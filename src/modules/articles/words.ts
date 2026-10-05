/**
 * Word material for "der, die, das". Only familiar nouns with one clear
 * article, no mass nouns (ein/eine must fit) and no words with two articles.
 * The emoji only decorates: the word is always written next to it.
 */

export type Article = 'der' | 'die' | 'das';
export const ARTICLES: readonly Article[] = ['der', 'die', 'das'];

export interface Noun {
  word: string;
  article: Article;
  emoji: string;
}

/** Twelve per article, for "der, die oder das?", "ein oder eine?" and the stories. */
export const NOUNS: readonly Noun[] = [
  { word: 'Apfel', article: 'der', emoji: '🍎' },
  { word: 'Hund', article: 'der', emoji: '🐶' },
  { word: 'Baum', article: 'der', emoji: '🌳' },
  { word: 'Schuh', article: 'der', emoji: '👞' },
  { word: 'Löffel', article: 'der', emoji: '🥄' },
  { word: 'Koffer', article: 'der', emoji: '🧳' },
  { word: 'Igel', article: 'der', emoji: '🦔' },
  { word: 'Fisch', article: 'der', emoji: '🐟' },
  { word: 'Schlüssel', article: 'der', emoji: '🔑' },
  { word: 'Ball', article: 'der', emoji: '⚽' },
  { word: 'Mond', article: 'der', emoji: '🌙' },
  { word: 'Zug', article: 'der', emoji: '🚂' },
  { word: 'Banane', article: 'die', emoji: '🍌' },
  { word: 'Katze', article: 'die', emoji: '🐱' },
  { word: 'Blume', article: 'die', emoji: '🌷' },
  { word: 'Wolke', article: 'die', emoji: '☁️' },
  { word: 'Uhr', article: 'die', emoji: '⏰' },
  { word: 'Hose', article: 'die', emoji: '👖' },
  { word: 'Kerze', article: 'die', emoji: '🕯️' },
  { word: 'Biene', article: 'die', emoji: '🐝' },
  { word: 'Ente', article: 'die', emoji: '🦆' },
  { word: 'Brille', article: 'die', emoji: '👓' },
  { word: 'Schere', article: 'die', emoji: '✂️' },
  { word: 'Maus', article: 'die', emoji: '🐭' },
  { word: 'Auto', article: 'das', emoji: '🚗' },
  { word: 'Haus', article: 'das', emoji: '🏠' },
  { word: 'Buch', article: 'das', emoji: '📖' },
  { word: 'Herz', article: 'das', emoji: '❤️' },
  { word: 'Fenster', article: 'das', emoji: '🪟' },
  { word: 'Telefon', article: 'das', emoji: '☎️' },
  { word: 'Fahrrad', article: 'das', emoji: '🚲' },
  { word: 'Ei', article: 'das', emoji: '🥚' },
  { word: 'Pferd', article: 'das', emoji: '🐴' },
  { word: 'Bett', article: 'das', emoji: '🛏️' },
  { word: 'Schaf', article: 'das', emoji: '🐑' },
  { word: 'Geschenk', article: 'das', emoji: '🎁' },
];

/** "Nomen entdecken": nouns from school, the classroom and the book's word lists. */
export const DISCOVER_NOUNS: readonly { word: string; article: Article }[] = [
  { word: 'Tisch', article: 'der' },
  { word: 'Stift', article: 'der' },
  { word: 'Papierkorb', article: 'der' },
  { word: 'Streit', article: 'der' },
  { word: 'Schuh', article: 'der' },
  { word: 'Koffer', article: 'der' },
  { word: 'Igel', article: 'der' },
  { word: 'Baum', article: 'der' },
  { word: 'Tafel', article: 'die' },
  { word: 'Pause', article: 'die' },
  { word: 'Jacke', article: 'die' },
  { word: 'Kerze', article: 'die' },
  { word: 'Höhle', article: 'die' },
  { word: 'Tüte', article: 'die' },
  { word: 'Suppe', article: 'die' },
  { word: 'Puppe', article: 'die' },
  { word: 'Zimmer', article: 'das' },
  { word: 'Buch', article: 'das' },
  { word: 'Lineal', article: 'das' },
  { word: 'Spiel', article: 'das' },
  { word: 'Brot', article: 'das' },
  { word: 'Kleid', article: 'das' },
  { word: 'Fahrrad', article: 'das' },
  { word: 'Haar', article: 'das' },
];

/**
 * Words that are no nouns: describing words, little words and verb forms that
 * cannot take an article. No colours ("das Blau") and no infinitives
 * ("das Spielen"), which can be nouns too.
 */
export const NOT_NOUNS: readonly string[] = [
  'weich', 'sehr', 'auf', 'wer', 'schön', 'leise', 'dünn', 'eng', 'faul', 'krank',
  'lustig', 'müde', 'und', 'hier', 'oft', 'mit', 'lacht', 'singt', 'rennt', 'schläft',
  'liest', 'hüpft',
];

export interface Sentence {
  words: string[];
  /** Index of the one noun. */
  noun: number;
  article: Article;
}

function sentence(text: string, noun: string, article: Article): Sentence {
  const words = text.split(' ');
  const index = words.findIndex((w) => w.replace(/[.!?]$/, '') === noun);
  if (index < 0) throw new Error(`noun ${noun} missing in "${text}"`);
  return { words, noun: index, article };
}

/** One noun per sentence, no names (they are nouns too), no ß (shown in capitals). */
export const SENTENCES: readonly Sentence[] = [
  sentence('Die Wolke ist sehr dunkel.', 'Wolke', 'die'),
  sentence('Ich laufe in das Haus.', 'Haus', 'das'),
  sentence('Ich öffne das Fenster.', 'Fenster', 'das'),
  sentence('Die Pfütze ist riesig.', 'Pfütze', 'die'),
  sentence('Der Hund wird nass.', 'Hund', 'der'),
  sentence('Ich fahre mit dem Fahrrad.', 'Fahrrad', 'das'),
  sentence('Heute ist die Pause lang.', 'Pause', 'die'),
  sentence('Das Buch liegt hier.', 'Buch', 'das'),
  sentence('Wir spielen mit dem Ball.', 'Ball', 'der'),
  sentence('Meine Katze schläft viel.', 'Katze', 'die'),
  sentence('Der Apfel ist rot.', 'Apfel', 'der'),
  sentence('Ich male eine Blume.', 'Blume', 'die'),
  sentence('Die Sonne scheint hell.', 'Sonne', 'die'),
  sentence('Ich esse ein Eis.', 'Eis', 'das'),
  sentence('Schnell rennt der Hase.', 'Hase', 'der'),
  sentence('Das Auto fährt langsam.', 'Auto', 'das'),
  sentence('Ich sehe den Mond.', 'Mond', 'der'),
  sentence('Morgen kommt mein Opa.', 'Opa', 'der'),
];

/** Mini stories: the first sentence introduces the thing, the second knows it. */
/**
 * Story sentences about a picture; "_" stands for article and noun, always in
 * the nominative. The picture frame lets even "der Mond" come in with "ein".
 * Half of each list puts the article at the start of the sentence.
 */
export const STORY_INTROS: readonly string[] = [
  'Auf dem Bild ist _.', 'Hier ist _ zu sehen.', 'Da ist _ abgebildet.',
  '_ ist auf dem Bild.', '_ ist hier zu sehen.', '_ ist dort abgebildet.',
];
/** The same thing again: der, die, das. */
export const STORY_KNOWN: readonly string[] = [
  '_ gefällt mir.', '_ sieht schön aus.', '_ ist gut zu sehen.',
  'Mir gefällt _.', 'Auf dem Bild gefällt mir _.', 'Wie schön _ aussieht!',
];
/** A second, new thing joins: ein, eine. */
export const STORY_NEW: readonly string[] = [
  '_ ist auch auf dem Bild.', '_ ist auch zu sehen.', '_ ist ebenfalls abgebildet.',
  'Außerdem ist _ auf dem Bild.', 'Hier ist auch _ zu sehen.', 'Und dort ist _ abgebildet.',
];
/** A known-thing sentence must not repeat these from the intro ("… zu sehen. … gut zu sehen."). */
const STORY_PHRASES = ['Bild', 'sehen', 'abgebildet'];

export function storyPairFits(intro: string, known: string): boolean {
  return !STORY_PHRASES.some((p) => intro.includes(p) && known.includes(p));
}

export function indefinite(article: Article): 'ein' | 'eine' {
  return article === 'die' ? 'eine' : 'ein';
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The word as shown in "Nomen entdecken": capitals, so the spelling gives nothing away. */
export function shout(word: string): string {
  return word.toLocaleUpperCase('de-DE');
}
