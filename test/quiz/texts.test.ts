import { describe, expect, it } from 'vitest';
import { leavesCourse } from '../../src/modules/leaves/course';
import { treeCourse } from '../../src/modules/tree/course';
import { FACTS, NAMES, type FactKey } from '../../src/modules/tree/content';
import type { QuizCourse } from '../../src/shared/quiz/course';
import { ANSWER_FOLLOWS } from '../../src/shared/game/texts';
import { Engine, exampleKeys, freshProgress, stageNumbers, type Task } from '../../src/shared/quiz/engine';
import { seeded } from '../rng';

const T0 = 1_700_000_000_000;

/** Every task of every stage with every option, as an example and as practice. */
function allTasks(course: QuizCourse): Task[] {
  const p = freshProgress(course, T0);
  p.stages.forEach((s) => Object.assign(s, { unlocked: true, steps: 9 }));
  const engine = new Engine(course, p, seeded(1));
  return stageNumbers(course).flatMap((stage) =>
    exampleKeys(course, stage).flatMap((key) => (['example', 'practice'] as const).map((kind) => engine.makeTask(stage, kind, key))));
}

/** Sentences of a message, "Die richtige Antwort ist …" not counted. */
function sentences(text: string[]): number {
  return text.filter((t) => t !== ANSWER_FOLLOWS).join(' ').split(/(?<=[.!?])\s+/).filter(Boolean).length;
}

describe.each([['Der Baum', treeCourse], ['Laubbäume', leavesCourse]] as const)('texts of %s', (_name, course) => {
  const tasks = allTasks(course);

  it('explain in at most two short sentences before the answer', () => {
    for (const t of tasks) {
      const example = course.explanation(t);
      expect(example.at(-1)).toBe(ANSWER_FOLLOWS);
      expect(sentences(example)).toBeLessThanOrEqual(2);
      expect(sentences(course.question(t))).toBe(1);
      for (const chosen of t.options) {
        if (chosen !== t.options[t.correctIndex]) expect(sentences(course.mistake(t, chosen))).toBeLessThanOrEqual(2);
      }
      expect(sentences(course.confirmation('Richtig!', t))).toBe(2);
      for (const sentence of [...course.explanation(t), ...course.question(t), ...(course.help(t) ?? [])]) {
        expect(sentence).toBe(sentence.trim());
        expect(sentence.length).toBeLessThan(90);
      }
    }
  });

  it('label every answer card in words', () => {
    for (const t of tasks) {
      for (const answer of t.options) {
        const { label, html } = course.option(t.stage, answer);
        expect(label).toMatch(/\p{L}/u);
        expect(html).toContain(label);
      }
    }
  });

  it('give the card a label that does not tell the answer while asked', () => {
    for (const t of tasks.filter((task) => task.kind === 'practice' && task.stage < 3)) {
      const { label } = course.card(t, false);
      const right = course.option(t.stage, t.options[t.correctIndex]).label;
      expect(label).not.toContain(right);
    }
  });
});

describe('Der Baum texts', () => {
  it('explain a wrong part in stage 2 only with a task explained before', () => {
    // The first task of each part comes in the first two steps, before any second one.
    const firstTwo = new Set<string>(treeCourse.stages[1].steps.slice(0, 2).flat());
    const t = allTasks(treeCourse).find((task) => task.stage === 2 && task.key === 's2')!;
    for (const chosen of Object.keys(NAMES).filter((n) => n !== 'stamm' && Object.values(FACTS).some((f) => f.part === n))) {
      const [why] = treeCourse.mistake(t, chosen);
      const key = (Object.keys(FACTS) as FactKey[]).find((k) => FACTS[k].sentence === why)!;
      expect(firstTwo.has(key)).toBe(true);
    }
  });

  it('asks stage 2 with a question that does not give the part away by its article', () => {
    for (const key of exampleKeys(treeCourse, 2)) {
      expect(FACTS[key as FactKey].question).toMatch(/^Welcher Teil /);
    }
  });
});
