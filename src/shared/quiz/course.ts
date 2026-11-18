import type { QuizRules, Task } from './engine';

/**
 * A message the child reads and hears: fixed sentences, each recorded on its
 * own (scripts/german-texts.ts). At most two sentences before the answer.
 */
export type Text = string[];

/** Markup with the same meaning in words, for a screen reader. */
export interface Picture {
  html: string;
  label: string;
}

/** Everything a quiz module brings: its rules, pictures and sentences. */
export interface QuizCourse extends QuizRules {
  /** Name in the parents' area and the recordings list: "Der Baum". */
  title: string;
  /** The module as an object, at the start of a suggestion: "Den Baum" (entdecken). */
  object: string;
  /** Local storage key of the progress, e.g. "baum.progress.v1". */
  storageKey: string;
  /** Class on the stage card for the module's own layout. */
  cardClass: string;
  /** The card above the answers; `answered` once the answer is shown. */
  card(task: Task, answered: boolean): Picture;
  /** One answer button. */
  option(stage: number, answer: string): Picture;
  /** Stages whose answers are longer texts, one below the other on a phone. */
  textAnswers?(stage: number): boolean;
  question(task: Task): Text;
  /** What the speaker reads while a question is open, if more than the question, e.g. the statement on the sign. */
  read?(task: Task): Text;
  /** The guided example, read aloud at once; the answer lights up afterwards. */
  explanation(task: Task): Text;
  /** Help sentences, or null: then one wrong answer is taken away instead. */
  help(task: Task): Text | null;
  /** After a wrong answer: why the chosen one does not fit, then the right one. */
  mistake(task: Task, chosen: string): Text;
  /** After the answer, with "Richtig!", "Genau!" or "Gemeinsam geschafft!" in front. */
  confirmation(lead: string, task: Task): Text;
  /** Parents' area: what the module teaches and how the stages go. */
  legend: string;
}
