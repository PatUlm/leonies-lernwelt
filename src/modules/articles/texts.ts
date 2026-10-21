import { ANSWER_FOLLOWS } from '../../shared/game/texts';
import { EXAMPLE_KEYS, storyTemplates, type Task } from './engine';
import { capitalize, indefinite, shout } from './words';

/**
 * Everything the child reads or hears in "der, die, das". Article and noun
 * always come together ("der Apfel"): there is no rule to guess the article,
 * it is learnt with the word. At most two short sentences per message.
 */

const SWAP_RULE = 'Aus der und das wird ein, aus die wird eine.';
const NOUN_PROBE = 'Passt der, die oder das davor? Dann ist es ein Nomen.';
/** The first example of stage 1 names what the module calls them. */
const ARTICLE_TERM = 'Der, die und das heißen Artikel.';
const STORY_NEW_RULE = 'Für etwas Neues nehmen wir ein oder eine.';
const STORY_SAME_RULE = 'Für dieselbe Sache nehmen wir der, die oder das.';

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
    article: 'der, die oder das?',
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
    case 'story': {
      const { kind } = task.story!;
      if (kind === 'first') return `${capitalize(definite(task))} kommt zum ersten Mal vor: ${indefinite(task.article!)} ${w}.`;
      if (kind === 'known') return `Es ist noch ${task.article}selbe ${w}: ${definite(task)}.`;
      return `${capitalize(definite(task))} kommt neu dazu: ${indefinite(task.article!)} ${w}.`;
    }
  }
}

/** Guided example: what to look at; the answer lighting up completes it. */
export function explanation(task: Task): string {
  const answer = ANSWER_FOLLOWS;
  switch (task.variant) {
    case 'article':
      return task.key === EXAMPLE_KEYS[1][0]
        ? `Es heißt ${definite(task)}. ${ARTICLE_TERM} ${answer}`
        : `Es heißt ${definite(task)}. ${answer}`;
    case 'indefinite':
      return `${definite(task)} – ${indefinite(task.article!)} ${task.word}. ${SWAP_RULE} ${answer}`;
    case 'noun':
      return task.article
        ? `Passt der, die oder das davor? ${capitalize(definite(task))} – ja, ${shout(task.word)} ist ein Nomen. ${answer}`
        : `Passt der, die oder das davor? „der ${task.word}“, „die ${task.word}“, „das ${task.word}“ – nein! ${answer}`;
    case 'sentence':
      return `Tippe im Satz auf das Nomen. Vor ${shout(task.word)} passt ${task.article}: ${definite(task)}. ${answer}`;
    default:
      return `${confirmation(task)} ${answer}`;
  }
}

/** After a mistake: the right form and the probe or rule that finds it. */
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
      return `${confirmation(task)} ${task.story!.kind === 'known' ? STORY_SAME_RULE : STORY_NEW_RULE}`;
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
      return NOUN_PROBE;
    case 'story':
      return `${STORY_NEW_RULE} ${STORY_SAME_RULE}`;
  }
}

/** The two sentences of a story; `gap` is replaced by the given text. */
export function storyLines(task: Task, gap: string): [string, string] {
  const story = task.story!;
  const [intro, next] = storyTemplates(story);
  const article = task.article!;
  // "_" at the start of a template starts the sentence: capitalised.
  const fill = (template: string, words: string) => {
    const s = template.replace('_', words);
    return template.startsWith('_') ? capitalize(s) : s;
  };
  if (story.kind === 'new') {
    return [fill(intro, `${indefinite(story.before!.article)} ${story.before!.word}`), fill(next, `${gap} ${task.word}`)];
  }
  return [
    fill(intro, `${story.kind === 'first' ? gap : indefinite(article)} ${task.word}`),
    fill(next, `${story.kind === 'known' ? gap : article} ${task.word}`),
  ];
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
