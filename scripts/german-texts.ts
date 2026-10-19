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
import { EXAMPLES as HOWMANY_EXAMPLES, STAGES as HOWMANY_STAGES, parseKey as parseHowMany } from '../src/modules/howmany/engine';
import {
  BUILD_PROMPT, COMPLETE_HELP, HINTS as HOWMANY_HINTS, MARKED_CARD, explanation as howManyExample, help as howManyHelp, reveal as howManyReveal,
} from '../src/modules/howmany/texts';
import { BACK_EXAMPLE, EXAMPLES, STAGES as INVERSE_STAGES, levelOf, stepsOf, type Problem } from '../src/modules/inverse/engine';
import {
  CHOOSE_HELP, CHOOSE_QUESTION, CHOOSE_RIGHT, CHOOSE_WRONG, EXAMPLE_TYPE, HINTS, explanation as inverseExample,
  help as inverseHelp, question as inverseQuestion,
} from '../src/modules/inverse/texts';
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

  // Umkehraufgaben: examples, questions, help and hints
  const front = ([total, part]: readonly [number, number]): Problem => ({ total, part, shape: 'front' });
  for (const stage of INVERSE_STAGES) {
    for (const example of EXAMPLES[levelOf(stage)]) add(`Umkehr ${stage}: Beispiel`, inverseExample(stage, front(example)));
  }
  add(`Umkehr ${BACK_EXAMPLE.stage}: Beispiel`, inverseExample(BACK_EXAMPLE.stage, BACK_EXAMPLE.problem));
  add('Umkehr: Beispiel', EXAMPLE_TYPE);
  // Two lines without a ten to cross, from a round ten and over the ten; one line; directly with the check sum.
  const lines = [
    ...stepsOf({ form: 1, problem: front(EXAMPLES[1][0]), probe: false }),
    ...stepsOf({ form: 1, problem: front(EXAMPLES[2][0]), probe: false }),
    ...stepsOf({ form: 1, problem: front(EXAMPLES[3][0]), probe: false }),
    ...stepsOf({ form: 2, problem: front(EXAMPLES[1][0]), probe: false }),
    ...stepsOf({ form: 3, problem: front(EXAMPLES[1][0]), probe: true }),
  ];
  for (const step of lines) {
    add('Umkehr: Frage', inverseQuestion(step));
    add('Umkehr: Hilfe', inverseHelp(step));
  }
  for (const step of lines.filter((s) => s.kind === 'line' || s.kind === 'direct')) add('Umkehr: Frage', `${CHOOSE_RIGHT} ${inverseQuestion(step)}`);
  add('Umkehr: Frage', CHOOSE_QUESTION);
  add('Umkehr: Hilfe', CHOOSE_HELP, CHOOSE_WRONG, ...Object.values(HINTS));

  // Farben, Zahlen, Tiere: the German parts around the English word
  for (const word of WORDS) {
    for (const isNew of [true, false]) add('Englisch: Beispiel', ...german(example({ word, isNew } as EnglishTask)));
    for (const variant of ['listen', 'read', 'word'] as const) {
      for (const dropped of [false, true]) add('Englisch: Hilfe', ...german(englishHelp({ word, variant } as EnglishTask, true, dropped)));
    }
  }

  // How many?: the German parts around the English sentences
  for (const stage of HOWMANY_STAGES) {
    for (const key of HOWMANY_EXAMPLES[stage]) add(`How many ${stage}: Beispiel`, ...german(howManyExample(stage, parseHowMany(key)!)));
  }
  add('How many: Beispiel', MARKED_CARD);
  add('How many: Frage', BUILD_PROMPT, COMPLETE_HELP);
  add('How many: Hilfe', ...Object.values(HOWMANY_HINTS));
  for (const key of ['ghost:1', 'ghost:2']) {
    for (const slot of [0, 1, 2, 3]) add('How many: Hilfe', howManyHelp(slot, parseHowMany(key)!));
  }
  add('How many: Hilfe', ...german(howManyReveal(parseHowMany('ghost:1')!)));
  add('How many: Lob', ...['Richtig!', 'Genau!', 'Gemeinsam geschafft!']);
  return [...all].map(([text, source]) => ({ text, source }));
}
