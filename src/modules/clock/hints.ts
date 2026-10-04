import { SUFFIX, contextConfirmation, hour24, type DayContext } from './daytime';
import type { AnswerOption } from './distractors';
import type { Track } from './engine';
import { capitalize, formatSpoken, formatSpokenCapitalized, numberWord } from './german';
import { formatDigital, wrapHour, type ClockTime } from './time';

/** Which part of the clock a hint is about; the clock highlights it. */
export type HintFocus = 'hour' | 'minute';

export interface Hint {
  text: string;
  focus: HintFocus;
}

/** What hints and explanations need to know about a task. */
export interface TaskInfo {
  track: Track;
  time: ClockTime;
  context?: DayContext;
}

const AFTERNOON_RULE = 'Nach zwölf Uhr mittags zählen wir weiter: dreizehn, vierzehn, fünfzehn …';

function spokenFor(track: Track, t: ClockTime): string {
  return formatSpoken(t, { half: track === 'halb' });
}

/** What the clock shows, as confirmed after a correct answer. */
export function confirmation(task: TaskInfo): string {
  const { track, time } = task;
  if (task.context) return contextConfirmation(task.context, time);
  if (track === 'text' || track === 'halb') return `Es ist ${spokenFor(track, time)}.`;
  return `Es ist ${formatDigital(time)}.`;
}

/** Number the minute hand points at or has just passed (12 at the top). */
function minuteNumber(minute: number): number {
  const n = Math.floor(minute / 5);
  return n === 0 ? 12 : n;
}

/** Where the minute hand belongs: "auf die 9" or "zwei Striche nach der 4". */
function minutePlace(minute: number): string {
  const rest = minute % 5;
  if (rest === 0) return `auf die ${minuteNumber(minute)}`;
  const strokes = rest === 1 ? 'einen Strich' : `${numberWord(rest)} Striche`;
  return `${strokes} nach der ${minuteNumber(minute)}`;
}

/** Where the hour hand belongs: "genau auf die 3" or "zwischen die 3 und die 4". */
function hourPlace(t: ClockTime): string {
  return t.minute === 0 ? `genau auf die ${t.hour}` : `zwischen die ${t.hour} und die ${wrapHour(t.hour + 1)}`;
}

function minuteHandSentence(minute: number): string {
  if (minute === 0) return 'Der lange Zeiger zeigt nach oben auf die 12. Das ist eine volle Stunde.';
  const rest = minute % 5;
  if (rest === 0) return `Der lange Zeiger zeigt auf die ${minuteNumber(minute)}. Das sind ${minute} Minuten.`;
  const strokes = rest === 1 ? 'einen Strich' : `${rest} Striche`;
  return `Der lange Zeiger steht ${strokes} nach der ${minuteNumber(minute)}. Das sind ${minute} Minuten.`;
}

function hourHandSentence(t: ClockTime, chosenHour: number): string {
  const next = wrapHour(t.hour + 1);
  if (t.minute === 0) return `Der kurze Zeiger zeigt genau auf die ${t.hour}. Die Stunde ist ${t.hour}.`;
  if (chosenHour === next) return `Der kurze Zeiger ist noch nicht bei der ${next}. Die Stunde ist noch ${t.hour}.`;
  return `Der kurze Zeiger ist schon an der ${t.hour} vorbei. Die Stunde ist ${t.hour}.`;
}

/** "Zähle vom Zwölferstrich: fünf, zehn, …, zwanzig, einundzwanzig, zweiundzwanzig." */
function countingSentence(minute: number): string {
  if (minute === 0) return 'Der lange Zeiger zeigt auf die 12: null Minuten.';
  const fives = Array.from({ length: Math.floor(minute / 5) }, (_, i) => (i + 1) * 5);
  const ones = Array.from({ length: minute % 5 }, (_, i) => Math.floor(minute / 5) * 5 + i + 1);
  const steps = [...fives, ...ones].map((n) => numberWord(n));
  const shown = steps.length > 7 ? ['…', ...steps.slice(-6)] : steps;
  return `Zähle vom Zwölferstrich: ${shown.join(', ')}.`;
}

/** Exactly one hint for a wrong choice, matching the misconception behind it. */
export function hintFor(task: TaskInfo, chosen: AnswerOption): Hint {
  const { track, time: t } = task;
  const hourWrong = chosen.time.hour !== t.hour;
  if (track === 'daytime' && task.context) {
    const right = contextConfirmation(task.context, t);
    if (chosen.kind === 'otherHalf') {
      const late = task.context === 'afternoon' || task.context === 'evening';
      return { text: `Schau auf das Bild und die Tageszeit.${late ? ` ${AFTERNOON_RULE}` : ''} ${right}`, focus: 'hour' };
    }
    if (hourWrong) return { text: `${hourHandSentence(t, chosen.time.hour)} ${right}`, focus: 'hour' };
    return { text: `${minuteHandSentence(t.minute)} ${right}`, focus: 'minute' };
  }
  const nextHourSaid = track === 'halb' ? t.minute >= 20 : t.minute >= 30;
  if ((track === 'text' || track === 'halb') && hourWrong && nextHourSaid) {
    const lead = track === 'halb' ? 'Bei „vor halb“ und „nach halb“' : t.minute === 30 ? 'Bei „halb“' : 'Bei „vor“';
    return {
      text: `${lead} sagt man die nächste Stunde: ${formatDigital(t)} ist „${spokenFor(track, t)}“.`,
      focus: 'hour',
    };
  }
  if (hourWrong) return { text: hourHandSentence(t, chosen.time.hour), focus: 'hour' };
  return { text: minuteHandSentence(t.minute), focus: 'minute' };
}

/** Hint after setting the hands wrongly: minutes first (they move the hour hand too). */
export function setHint(target: ClockTime, set: ClockTime): Hint {
  if (set.minute !== target.minute) {
    const named: Record<number, string> = { 15: 'Viertel nach', 30: 'Halb', 45: 'Viertel vor', 0: 'Volle Stunde' };
    const lead = target.minute in named ? `${named[target.minute]}: ` : '';
    return { text: `${lead}Der lange Zeiger gehört ${minutePlace(target.minute)}.`, focus: 'minute' };
  }
  return { text: `Stelle den kurzen Zeiger ${hourPlace(target)}.`, focus: 'hour' };
}

/** Hint after typing a wrong time: hour first, then minutes. */
export function inputHint(target: ClockTime, typedHour: number): Hint {
  if ((typedHour % 12 || 12) !== target.hour) {
    const next = wrapHour(target.hour + 1);
    const text =
      target.minute === 0
        ? `Der kurze Zeiger zeigt genau auf die ${numberWord(target.hour)}.`
        : `Der kurze Zeiger ist noch zwischen ${numberWord(target.hour)} und ${numberWord(next)}.`;
    return { text, focus: 'hour' };
  }
  return { text: countingSentence(target.minute), focus: 'minute' };
}

/** From the clock hour to the 24-hour value: "Am Abend zählen wir nach zwölf weiter: 9 + 12 = 21." */
function towards24(context: DayContext, hour: number): string {
  switch (context) {
    case 'afternoon':
      return `Am Nachmittag zählen wir nach zwölf weiter: ${hour} + 12 = ${hour + 12}.`;
    case 'evening':
      return `Am Abend zählen wir nach zwölf weiter: ${hour} + 12 = ${hour + 12}.`;
    case 'forenoon':
      return `Am Vormittag zählen wir nicht weiter: ${hour} bleibt ${hour}.`;
    case 'noon':
      return 'Am Mittag ist es zwölf: 12 bleibt 12.';
    case 'night':
      return 'Nach Mitternacht beginnt der Tag wieder bei null: Aus 12 wird 0.';
  }
}

/** From the 24-hour value back to the clock: "21 Uhr ist 9 Uhr am Abend. Rechne zwölf weniger: 21 − 12 = 9." */
function towardsClock(context: DayContext, hour: number): string {
  const h24 = hour24(context, hour);
  switch (context) {
    case 'afternoon':
    case 'evening':
      return `${h24} Uhr ist ${hour} Uhr ${SUFFIX[context]}. Rechne zwölf weniger: ${h24} − 12 = ${hour}.`;
    case 'forenoon':
      return `${h24} Uhr ist am Vormittag: Die Stunde bleibt ${hour}.`;
    case 'noon':
      return '12 Uhr ist Mittag: Die Stunde bleibt 12.';
    case 'night':
      return '0 Uhr ist Mitternacht: Auf der Uhr ist das die 12.';
  }
}

/** Setting the hands for "21:30": minutes first, then the converted hour. */
export function daySetHint(target: ClockTime, context: DayContext, set: ClockTime): Hint {
  if (set.minute !== target.minute) return setHint(target, set);
  return { text: `${towardsClock(context, target.hour)} Stelle den kurzen Zeiger ${hourPlace(target)}.`, focus: 'hour' };
}

/** Typing "21:30" for the clock with a time of day: read right but not converted, or misread. */
export function dayInputHint(target: ClockTime, context: DayContext, typed: { hour: number; minute: number }): Hint {
  const hourRead = (typed.hour % 12 || 12) === target.hour;
  if (hourRead && typed.hour !== hour24(context, target.hour)) {
    const praise = typed.minute === target.minute ? 'Du hast die Uhr richtig abgelesen. ' : '';
    return { text: `${praise}${towards24(context, target.hour)}`, focus: 'hour' };
  }
  return inputHint(target, typed.hour);
}

/** The general rule of a time of day, for the help button: no hour of the task given away. */
export function contextRule(context: DayContext): string {
  switch (context) {
    case 'afternoon':
      return 'Am Nachmittag zählen wir nach zwölf weiter: aus 3 Uhr wird 15 Uhr.';
    case 'evening':
      return 'Am Abend zählen wir nach zwölf weiter: aus 7 Uhr wird 19 Uhr.';
    case 'forenoon':
      return 'Am Vormittag bleibt die Stunde, wie sie auf der Uhr steht.';
    case 'noon':
      return 'Am Mittag bleibt die 12 eine 12.';
    case 'night':
      return 'Nach Mitternacht beginnt der Tag wieder bei null: aus 12 wird 0.';
  }
}

/** Explanation for a guided example (not scored). */
export function explainExample(task: TaskInfo): string {
  const { track, time: t } = task;
  const { hour, minute } = t;
  const next = wrapHour(hour + 1);
  const digital = formatDigital(t);
  if (track === 'daytime' && task.context) {
    const h24 = hour24(task.context, hour);
    const rule = h24 >= 13 ? ` ${AFTERNOON_RULE}` : h24 === 0 ? ' Nach Mitternacht beginnt der Tag wieder bei null.' : '';
    return `Das Bild zeigt die Tageszeit.${rule} ${contextConfirmation(task.context, t)}`;
  }
  if (track === 'daySet' && task.context) {
    return `${towardsClock(task.context, hour)} Zieh den langen Zeiger ${minutePlace(minute)} und den kurzen Zeiger ${hourPlace(t)}. Dann tippe auf „Fertig“.`;
  }
  if (track === 'dayInput' && task.context) {
    const written = `${hour24(task.context, hour)}:${String(minute).padStart(2, '0')}`;
    const digits = [...written.replace(':', '')].join(' ');
    return `Die Uhr zeigt ${formatSpoken(t)}. Das Bild zeigt die Tageszeit. ${towards24(task.context, hour)} Tippe ${digits} – das ist ${written}.`;
  }
  if (track === 'set') {
    return `Zieh den langen Zeiger ${minutePlace(minute)} und den kurzen Zeiger ${hourPlace(t)}. Dann tippe auf „Fertig“.`;
  }
  if (track === 'input') {
    const digits = [...digital.replace(':', '')].join(' ');
    return `Lies zuerst die Stunde, dann die Minuten: Es ist ${digital}. Tippe ${digits} – wie auf einer Digitaluhr.`;
  }
  if (track === 'halb') {
    const diff = numberWord(Math.abs(30 - minute));
    const why =
      minute < 30
        ? `Bis halb ${numberWord(next)} fehlen noch ${diff} Minuten.`
        : `Halb ${numberWord(next)} ist schon ${diff} Minuten vorbei.`;
    return `${why} Darum sagen viele bei ${digital} auch „${spokenFor(track, t)}“.`;
  }
  if (track === 'text') {
    const spoken = formatSpoken(t);
    if (minute === 0) return `Bei einer vollen Stunde sagt man „Uhr“: ${digital} ist „${spoken}“.`;
    if (minute === 30) return `Eine halbe Stunde fehlt noch bis ${next} Uhr. Darum sagt man bei ${digital} „${spoken}“.`;
    const minutes = (n: number) => (n === 1 ? 'eine Minute' : `${n} Minuten`);
    if (minute < 30) return `${capitalize(minutes(minute))} nach der vollen Stunde: ${digital} ist „${spoken}“.`;
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
