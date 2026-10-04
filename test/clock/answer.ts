import type { AnswerResult, Engine, Task } from '../../src/modules/clock/engine';

/** Answers any task (choice, set the hands, type the time) right or wrong. */
export function answerTask(engine: Engine, task: Task, ok: boolean, helped = false, elapsedMs = 10_000): AnswerResult {
  if (task.mode === 'choice') {
    const index = ok ? task.correctIndex : task.options.findIndex((o) => o.kind !== 'correct');
    return engine.answer(task, index, helped, elapsedMs);
  }
  const given = ok ? task.time : { hour: (task.time.hour % 12) + 1, minute: task.time.minute };
  return engine.answerTime(task, given, helped, elapsedMs);
}
