import { hour24 } from '../../src/modules/clock/daytime';
import type { AnswerResult, Engine, Task } from '../../src/modules/clock/engine';

/** Answers any task (choice, set the hands, type the time) right or wrong. */
export function answerTask(engine: Engine, task: Task, ok: boolean, helped = false, elapsedMs = 10_000): AnswerResult {
  if (task.mode === 'choice') {
    const index = ok ? task.correctIndex : task.options.findIndex((o) => o.kind !== 'correct');
    return engine.answer(task, index, helped, elapsedMs);
  }
  // Typing with a time of day: the 24-hour time ("21:30").
  const hour = task.track === 'dayInput' && task.context ? hour24(task.context, task.time.hour) : task.time.hour;
  const given = ok ? { hour, minute: task.time.minute } : { hour: (task.time.hour % 12) + 1, minute: task.time.minute };
  return engine.answerTime(task, given, helped, elapsedMs);
}
