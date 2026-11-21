import type { Rule } from './pictures';

/**
 * "Waldregeln", from Leonie's HSU sheets "Unsere Waldregeln" (Klasse 3):
 *
 *   stage 1: scene → rule          a child with a finger on the lips: [Ich verhalte mich leise.] …
 *   stage 2: statement → judgement "Im Wald darfst du laut schreien.": [Richtig] [Falsch]
 *
 * The scenes show only the right behaviour. Why a rule matters is said in
 * every confirmation, never asked.
 */

/** Stage 1: the rules as on the sheet. */
export const RULE_TEXT: Record<Rule, string> = {
  weg: 'Ich bleibe auf dem Weg.',
  muell: 'Ich nehme meinen Müll wieder mit.',
  leise: 'Ich verhalte mich leise.',
  pflanzen: 'Ich lasse Bäume und Pflanzen heile.',
  gruppe: 'Ich bleibe bei meiner Gruppe.',
  ruecksicht: 'Ich nehme Rücksicht.',
};

/** Stage 1: first three clear scenes, "Rücksicht", the most abstract rule, alone at the end. */
export const RULE_STEPS: readonly (readonly Rule[])[] = [['weg', 'muell', 'leise'], ['pflanzen', 'gruppe'], ['ruecksicht']];

/** Stage 1: rules easily mixed up, one of them always offered once explained. */
export const RULE_PARTNERS: Record<Rule, readonly Rule[]> = {
  weg: ['gruppe', 'pflanzen'],
  muell: [],
  leise: ['ruecksicht'],
  pflanzen: ['weg', 'ruecksicht'],
  gruppe: ['weg'],
  ruecksicht: ['leise', 'pflanzen'],
};

export type Judgement = 'richtig' | 'falsch';
export const JUDGEMENTS: readonly Judgement[] = ['richtig', 'falsch'];

/** Stage 2: a statement of the sheet, whether it is right in the forest, and the rule behind it. */
export interface Statement {
  text: string;
  judgement: Judgement;
  /** The rule behind it; none for mushrooms and fire. */
  rule: Rule | null;
  /** Why, in one short sentence. */
  why: string;
}

export const STATEMENTS = {
  weg: {
    text: 'Im Wald solltest du auf dem Weg bleiben.',
    judgement: 'richtig',
    rule: 'weg',
    why: 'Neben dem Weg wachsen junge Pflanzen und wohnen Tiere.',
  },
  schreien: { text: 'Im Wald darfst du laut schreien.', judgement: 'falsch', rule: 'leise', why: 'Lärm erschreckt die Tiere.' },
  leise: { text: 'Im Wald verhältst du dich leise.', judgement: 'richtig', rule: 'leise', why: 'Wer leise ist, kann Tiere entdecken.' },
  muell: { text: 'Du darfst deinen Müll im Wald liegen lassen.', judgement: 'falsch', rule: 'muell', why: 'Müll kann Tiere krank machen.' },
  heile: {
    text: 'Du lässt Bäume und Pflanzen heile.',
    judgement: 'richtig',
    rule: 'pflanzen',
    why: 'Tiere brauchen die Pflanzen als Futter und Versteck.',
  },
  aeste: { text: 'Im Wald darfst du Äste abbrechen.', judgement: 'falsch', rule: 'pflanzen', why: 'Ein abgebrochener Ast verletzt den Baum.' },
  treten: {
    text: 'Du darfst auf Pflanzen und Blumen treten.',
    judgement: 'falsch',
    rule: 'pflanzen',
    why: 'Zertretene Pflanzen können nicht weiterwachsen.',
  },
  tiere: { text: 'Die Tiere im Wald lässt du in Ruhe.', judgement: 'richtig', rule: 'ruecksicht', why: 'Der Wald ist das Zuhause der Tiere.' },
  sauber: {
    text: 'Du sollst den Wald sauber wieder verlassen.',
    judgement: 'richtig',
    rule: 'muell',
    why: 'In einem sauberen Wald bleiben Tiere und Pflanzen gesund.',
  },
  pilze: {
    text: 'Pilze und Beeren darfst du in den Mund nehmen.',
    judgement: 'falsch',
    rule: null,
    why: 'Manche Pilze und Beeren sind giftig.',
  },
  feuer: { text: 'Im Wald darfst du Feuer machen.', judgement: 'falsch', rule: null, why: 'Ein Feuer kann den ganzen Wald anzünden.' },
} as const satisfies Record<string, Statement>;

export type StatementKey = keyof typeof STATEMENTS;

/** Stage 2: a right statement first (one button), a wrong one next, then both mixed. */
export const STATEMENT_STEPS: readonly (readonly StatementKey[])[] = [
  ['weg', 'schreien', 'leise', 'muell'],
  ['heile', 'aeste', 'treten', 'tiere'],
  ['sauber', 'pilze', 'feuer'],
];
