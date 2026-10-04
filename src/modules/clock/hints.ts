import type { AnswerOption } from './distractors';
import { capitalize, formatSpoken, formatSpokenCapitalized } from './german';
import { formatDigital, wrapHour, type ClockTime } from './time';

/** Which part of the clock a hint is about; the clock highlights it. */
export type HintFocus = 'hour' | 'minute';

export interface Hint {
  text: string;
  focus: HintFocus;
}

/** Number the minute hand points at or has just passed (12 at the top). */
function minuteNumber(minute: number): number {
  const n = Math.floor(minute / 5);
  return n === 0 ? 12 : n;
}

function minuteHandSentence(minute: number): string {
  if (minute === 0) return 'Der lange Zeiger zeigt nach oben auf die 12. Das ist eine volle Stunde.';
  const rest = minute % 5;
  if (rest === 0) {
    return `Der lange Zeiger zeigt auf die ${minuteNumber(minute)}. Das sind ${minute} Minuten.`;
  }
  const strokes = rest === 1 ? 'einen Strich' : `${rest} Striche`;
  return `Der lange Zeiger steht ${strokes} nach der ${minuteNumber(minute)}. Das sind ${minute} Minuten.`;
}

function hourHandSentence(t: ClockTime, chosenHour: number): string {
  const next = wrapHour(t.hour + 1);
  if (t.minute === 0) return `Der kurze Zeiger zeigt genau auf die ${t.hour}. Die Stunde ist ${t.hour}.`;
  if (chosenHour === next) {
    return `Der kurze Zeiger ist noch nicht bei der ${next}. Die Stunde ist noch ${t.hour}.`;
  }
  return `Der kurze Zeiger ist schon an der ${t.hour} vorbei. Die Stunde ist ${t.hour}.`;
}

/** Exactly one hint for a wrong answer, matching the misconception behind it. */
export function hintFor(track: 'digital' | 'text', t: ClockTime, chosen: AnswerOption): Hint {
  const hourWrong = chosen.time.hour !== t.hour;
  if (track === 'text' && hourWrong && t.minute >= 30) {
    const lead = t.minute === 30 ? 'Bei „halb“' : 'Bei „vor“';
    return {
      text: `${lead} sagt man die nächste Stunde: ${formatDigital(t)} ist „${formatSpoken(t)}“.`,
      focus: 'hour',
    };
  }
  if (hourWrong) return { text: hourHandSentence(t, chosen.time.hour), focus: 'hour' };
  return { text: minuteHandSentence(t.minute), focus: 'minute' };
}

/** Explanation for a guided example (not scored). */
export function explainExample(track: 'digital' | 'text', t: ClockTime): string {
  const { hour, minute } = t;
  const next = wrapHour(hour + 1);
  const digital = formatDigital(t);
  if (track === 'text') {
    const spoken = formatSpoken(t);
    if (minute === 0) return `Bei einer vollen Stunde sagt man „Uhr“: ${digital} ist „${spoken}“.`;
    if (minute === 30) {
      return `Eine halbe Stunde fehlt noch bis ${next} Uhr. Darum sagt man bei ${digital} „${spoken}“.`;
    }
    const minutes = (n: number) => (n === 1 ? 'eine Minute' : `${n} Minuten`);
    if (minute < 30) {
      return `${capitalize(minutes(minute))} nach der vollen Stunde: ${digital} ist „${spoken}“.`;
    }
    return `Noch ${minutes(60 - minute)} bis ${next} Uhr: ${digital} ist „${spoken}“.`;
  }

  const hourPart =
    minute === 0
      ? `Der kurze Zeiger zeigt auf die ${hour}.`
      : minute >= 30
        ? `Der kurze Zeiger ist zwischen der ${hour} und der ${next}, aber noch nicht bei der ${next}. Die Stunde ist ${hour}.`
        : `Der kurze Zeiger ist gerade an der ${hour} vorbei. Die Stunde ist ${hour}.`;
  let minutePart: string;
  if (minute === 0) minutePart = 'Der lange Zeiger zeigt nach oben auf die 12: volle Stunde.';
  else if (minute === 30) minutePart = 'Der lange Zeiger zeigt nach unten auf die 6: eine halbe Stunde, 30 Minuten.';
  else if (minute === 15) minutePart = 'Der lange Zeiger zeigt auf die 3: eine Viertelstunde, 15 Minuten.';
  else if (minute === 45) minutePart = 'Der lange Zeiger zeigt auf die 9: drei Viertelstunden, 45 Minuten.';
  else if (minute % 5 === 0) {
    const steps = Array.from({ length: minute / 5 }, (_, i) => (i + 1) * 5).join(', ');
    minutePart = `Zähle in Fünferschritten bis zum langen Zeiger: ${steps}.`;
  } else minutePart = minuteHandSentence(minute);
  return `${minutePart} ${hourPart} Es ist ${digital} – ${formatSpokenCapitalized(t)}.`;
}
