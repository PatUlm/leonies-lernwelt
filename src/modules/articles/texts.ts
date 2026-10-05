import type { Task } from './engine';
import { STORY_ENDS, STORY_STARTS, accusative, capitalize, indefinite, shout } from './words';

/**
 * Everything the child reads or hears in "der, die, das". Article and noun
 * always come together ("der Apfel"): there is no rule to guess the article,
 * it is learnt with the word.
 */

const SWAP_RULE = 'Aus der und das wird ein, aus die wird eine.';
const NOUN_PROBE = 'Passt der, die oder das davor? Dann ist es ein Nomen.';
const STORY_RULE =
  'Kommt etwas zum ersten Mal vor, heißt es ein oder eine. Kennen wir es schon, heißt es der, die oder das.';

/** "der Apfel" */
function definite(task: Task): string {
  return `${task.article} ${task.word}`;
}

/** The word as spoken or written normally: nouns capitalised, other words small. */
function normal(task: Task): string {
  return task.article ? capitalize(task.word) : task.word;
}

export function question(task: Task): string {
  const q = {
    article: 'Welcher Artikel passt?',
    indefinite: 'ein oder eine?',
    noun: 'Ist das ein Nomen?',
    sentence: 'Tippe auf das Nomen.',
    story: 'Welcher Artikel passt in die Lücke?',
  }[task.variant];
  return task.familiar ? `Das kannst du schon! ${q}` : q;
}

/** Why the answer is right: shown with examples and after a correct answer, as a sentence of its own. */
export function confirmation(task: Task): string {
  const w = task.word;
  switch (task.variant) {
    case 'article':
      return `${capitalize(definite(task))}.`;
    case 'indefinite':
      return `${capitalize(definite(task))} – ${indefinite(task.article!)} ${w}.`;
    case 'noun':
      return task.article
        ? `${capitalize(definite(task))} – ${shout(w)} ist ein Nomen.`
        : `Kein Artikel passt davor: ${shout(w)} ist kein Nomen.`;
    case 'sentence':
      return `${capitalize(definite(task))} – ${shout(w)} ist das Nomen.`;
    case 'story':
      return task.story!.gap === 0
        ? `${capitalize(definite(task))} kommt zum ersten Mal vor: ${indefinite(task.article!)} ${w}.`
        : `${capitalize(accusative(task.article!))} ${w} kennen wir schon: ${definite(task)}.`;
  }
}

/** Guided example: what to look at, then which button to tap. */
export function explanation(task: Task): string {
  const answer = `Tippe auf „${task.options[task.correctIndex]}“.`;
  switch (task.variant) {
    case 'article':
      return `Es heißt ${definite(task)}. ${answer}`;
    case 'indefinite':
      return `${definite(task)} – ${indefinite(task.article!)} ${task.word}. ${SWAP_RULE} ${answer}`;
    case 'noun':
      return task.article
        ? `Passt der, die oder das davor? ${capitalize(definite(task))} – ja! ${answer}`
        : `Passt der, die oder das davor? „der ${task.word}“, „die ${task.word}“, „das ${task.word}“ – nein! ${answer}`;
    default:
      return `${confirmation(task)} ${answer}`;
  }
}

/** After "Schauen wir zusammen.": the right form and the probe that finds it. */
export function mistake(task: Task): string {
  const w = task.word;
  switch (task.variant) {
    case 'article':
      return `Es heißt ${definite(task)}. Lerne das Wort immer mit seinem Artikel.`;
    case 'indefinite':
      return `Es heißt ${definite(task)}, also ${indefinite(task.article!)} ${w}. ${SWAP_RULE}`;
    case 'noun':
      return task.article
        ? `Davor passt ein Artikel: ${definite(task)}. Also ist ${shout(w)} ein Nomen.`
        : `„der ${w}“, „die ${w}“, „das ${w}“ – das passt nicht. ${shout(w)} ist kein Nomen.`;
    case 'sentence':
      return `Vor ${shout(w)} passt ein Artikel: ${definite(task)}. Das ist das Nomen.`;
    case 'story':
      return `${confirmation(task)} ${STORY_RULE}`;
  }
}

export function help(task: Task): string {
  switch (task.variant) {
    case 'article':
      return `Sag leise „der ${task.word}“, „die ${task.word}“ und „das ${task.word}“. Was hast du schon oft gehört?`;
    case 'indefinite':
      return `Es heißt ${definite(task)}. ${SWAP_RULE}`;
    case 'noun':
    case 'sentence':
      return `${NOUN_PROBE} Auch die Mehrzahl hilft oft: ein Tisch – viele Tische.`;
    case 'story':
      return STORY_RULE;
  }
}

/** The two sentences of a story; `gap` is replaced by the given text. */
export function storyLines(task: Task, gap: string): [string, string] {
  const { start, end, gap: at } = task.story!;
  const first = at === 0 ? gap : indefinite(task.article!);
  const second = at === 1 ? gap : capitalize(task.article!);
  return [`${STORY_STARTS[start]} ${first} ${task.word}.`, `${second} ${task.word} ${STORY_ENDS[end]}`];
}

/** What the card says when read aloud; "Lücke" stands for the gap. */
export function cardSpeech(task: Task): string {
  switch (task.variant) {
    case 'article':
      return task.word;
    case 'indefinite':
      return task.showDefinite ? definite(task) : task.word;
    case 'noun':
      return normal(task);
    case 'sentence':
      return task.sentence!.words.join(' ');
    case 'story':
      return storyLines(task, 'Lücke').join(' ');
  }
}
