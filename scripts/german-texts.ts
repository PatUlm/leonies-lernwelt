/**
 * Every German sentence the app reads aloud by itself that is the same for
 * every child: the guided examples (fixed lists), the help and the fixed
 * sentences. Built with the functions the games use, in the form they are
 * spoken (src/shared/spoken.ts), for scripts/render-german.ts.
 */
import { Engine as ArticleEngine, EXAMPLE_KEYS, STAGES as ARTICLE_STAGES, freshProgress as freshArticles } from '../src/modules/articles/engine';
import { explanation, help as articleHelp } from '../src/modules/articles/texts';
import { NOUNS } from '../src/modules/articles/words';
import type { DayContext } from '../src/modules/clock/daytime';
import { DAY_TRACKS, MIXED_TRACKS, TRACKS, TRACK_TIERS, exampleTimes, modeOf, setStep } from '../src/modules/clock/engine';
import { exampleMessage, explainExample, helpText, withContext } from '../src/modules/clock/hints';
import type { Task as EnglishTask } from '../src/modules/english/engine';
import { example, help as englishHelp } from '../src/modules/english/texts';
import { WORDS } from '../src/modules/english/words';
import { MARKED_IS_RIGHT } from '../src/shared/game/texts';
import type { SpeechPart } from '../src/shared/speech';
import { spokenGerman } from '../src/shared/spoken';

export interface GermanText {
  /** The spoken form, as the app looks it up. */
  text: string;
  /** Where it comes from, for the listening page. */
  source: string;
}

/** The German parts of a message: English words are recorded on their own. */
function german(parts: SpeechPart[]): string[] {
  return parts.filter((p): p is string => typeof p === 'string');
}

export function germanTexts(): GermanText[] {
  const all = new Map<string, string>();
  const add = (source: string, ...texts: string[]) => {
    for (const t of texts) {
      const text = spokenGerman(t);
      if (text && !all.has(text)) all.set(text, source);
    }
  };

  add('alle: Beispiel', MARKED_IS_RIGHT);

  // Der, die, das
  const articles = new ArticleEngine(freshArticles(Date.now()));
  for (const stage of ARTICLE_STAGES) {
    for (const key of EXAMPLE_KEYS[stage]) add(`Deutsch ${stage}: Beispiel`, explanation(articles.makeTask(stage, 'example', key)!));
  }
  for (const stage of [1, 2] as const) {
    for (const noun of NOUNS) add(`Deutsch ${stage}: Hilfe`, articleHelp(articles.makeTask(stage, 'practice', noun.word)!));
  }
  add('Deutsch 3: Hilfe', articleHelp(articles.makeTask(3, 'practice', 'w:Tisch')!), articleHelp(articles.makeTask(3, 'practice', 's:0')!));
  add('Deutsch 4: Hilfe', articleHelp(articles.makeTask(4, 'practice', EXAMPLE_KEYS[4][0])!));

  // Uhr: examples with the time of day in front, as on screen
  for (const track of TRACKS) {
    const mode = modeOf(track);
    for (const tier of TRACK_TIERS[track]) {
      const hourOnly = mode === 'set' && setStep(tier) >= 60;
      for (const { time, context } of exampleTimes(track, tier)) {
        const message = exampleMessage(explainExample({ track, time, context, hourOnly }), mode);
        add(`Uhr ${track} ${tier}: Beispiel`, withContext(context, time, message));
      }
      // Help: the time of day stands above it in the time-of-day tracks, and in the others once it is mixed in.
      const all: DayContext[] = ['afternoon', 'forenoon', 'evening', 'noon', 'night'];
      const contexts: (DayContext | undefined)[] = DAY_TRACKS.includes(track) ? all : MIXED_TRACKS.includes(track) ? [undefined, ...all] : [undefined];
      for (const context of contexts) {
        const spoken = helpText({ track, mode, context, hourOnly }, '').spoken;
        // At night the sentence depends on the minute: "Mitternacht" or "kurz nach Mitternacht".
        for (const minute of context === 'night' ? [0, 30] : [0]) add(`Uhr ${track} ${tier}: Hilfe`, withContext(context, { hour: 12, minute }, spoken));
      }
    }
  }

  // Farben, Zahlen, Tiere: the German parts around the English word
  for (const word of WORDS) {
    for (const isNew of [true, false]) add('Englisch: Beispiel', ...german(example({ word, isNew } as EnglishTask)));
    for (const variant of ['listen', 'read', 'word'] as const) {
      for (const dropped of [false, true]) add('Englisch: Hilfe', ...german(englishHelp({ word, variant } as EnglishTask, true, dropped)));
    }
  }
  return [...all].map(([text, source]) => ({ text, source }));
}
