/**
 * "Der Baum", from Leonie's HSU sheets on the forest (Klasse 3): "Teile eines
 * Laubbaumes", "Bau und Leben eines Baumes" and "Der Baum".
 *
 *   stage 1: part → name          the trunk lights up: [der Stamm] [die Rinde] [die Wurzeln]
 *   stage 2: task → part          "Welcher Teil trägt die Baumkrone?": [der Stamm] …
 *   stage 3: part → task          the roots: [Wasser und Nährstoffe aufnehmen] …
 */
export type Part = 'wurzeln' | 'stamm' | 'krone' | 'ast' | 'zweig' | 'blatt' | 'rinde' | 'frucht';
export const PARTS: readonly Part[] = ['wurzeln', 'stamm', 'krone', 'ast', 'zweig', 'blatt', 'rinde', 'frucht'];

/** Answer cards of stages 1 and 2, with the article. In stage 2 the leaves work together: "die Blätter". */
export const NAMES: Record<Part | 'blaetter', string> = {
  wurzeln: 'die Wurzeln',
  stamm: 'der Stamm',
  krone: 'die Baumkrone',
  ast: 'der Ast',
  zweig: 'der Zweig',
  blatt: 'das Blatt',
  rinde: 'die Rinde',
  frucht: 'die Frucht',
  blaetter: 'die Blätter',
};

/** Stage 1: first the three big areas, the pairs easily mixed up (Ast/Zweig, Stamm/Rinde) later. */
export const NAME_STEPS: readonly (readonly Part[])[] = [['wurzeln', 'stamm', 'krone'], ['ast', 'zweig', 'blatt'], ['rinde', 'frucht']];

/** Stage 1: one of them is always offered once explained. */
export const NAME_PARTNERS: Record<Part, readonly Part[]> = {
  wurzeln: [],
  stamm: ['rinde'],
  krone: ['ast'],
  ast: ['zweig', 'krone'],
  zweig: ['ast'],
  blatt: ['frucht'],
  rinde: ['stamm'],
  frucht: ['blatt'],
};

/** A task of a tree part, as on the sheets. Branches and twigs have none of their own there. */
export interface Fact {
  /** The part that does it; "blaetter" for the leaves. */
  part: Exclude<Part, 'blatt' | 'ast' | 'zweig'> | 'blaetter';
  /** Stage 2: the question. */
  question: string;
  /** Example, confirmation and mistake: the fact as a sentence. */
  sentence: string;
  /** Stage 3: the answer card, in the infinitive, so the verb gives nothing away. */
  card: string | null;
}

export const FACTS = {
  w1: {
    part: 'wurzeln',
    question: 'Welcher Teil nimmt Wasser und Nährstoffe aus dem Boden auf?',
    sentence: 'Die Wurzeln nehmen Wasser und Nährstoffe aus dem Boden auf.',
    card: 'Wasser und Nährstoffe aufnehmen',
  },
  s1: {
    part: 'stamm',
    question: 'Welcher Teil trägt die Baumkrone?',
    sentence: 'Der Stamm trägt die Baumkrone.',
    card: 'die Baumkrone tragen',
  },
  b1: {
    part: 'blaetter',
    question: 'Welcher Teil stellt Sauerstoff her?',
    sentence: 'Die Blätter stellen Sauerstoff her.',
    card: 'Sauerstoff herstellen',
  },
  r1: {
    part: 'rinde',
    question: 'Welcher Teil schützt den Stamm?',
    sentence: 'Die Rinde schützt den Stamm.',
    card: 'den Stamm schützen',
  },
  f1: {
    part: 'frucht',
    question: 'Welcher Teil trägt den Samen?',
    sentence: 'Die Frucht trägt den Samen.',
    card: 'den Samen tragen',
  },
  k1: {
    part: 'krone',
    question: 'Welcher Teil besteht aus Ästen, Zweigen und Blättern?',
    sentence: 'Die Baumkrone besteht aus Ästen, Zweigen und Blättern.',
    // "Besteht aus" is no task: not in stage 3.
    card: null,
  },
  w2: {
    part: 'wurzeln',
    question: 'Welcher Teil verankert den Baum im Boden?',
    sentence: 'Die Wurzeln verankern den Baum im Boden.',
    card: 'den Baum im Boden verankern',
  },
  s2: {
    part: 'stamm',
    question: 'Welcher Teil leitet die Nährstoffe weiter?',
    sentence: 'Der Stamm leitet die Nährstoffe weiter.',
    card: 'die Nährstoffe weiterleiten',
  },
  b2: {
    part: 'blaetter',
    question: 'Welcher Teil filtert die Luft?',
    sentence: 'Die Blätter filtern die Luft.',
    card: 'die Luft filtern',
  },
} as const satisfies Record<string, Fact>;

export type FactKey = keyof typeof FACTS;

export function isFact(key: string): key is FactKey {
  return Object.hasOwn(FACTS, key);
}

/** Stage 2: the second task of a part comes last. */
export const TASK_STEPS: readonly (readonly FactKey[])[] = [['w1', 's1', 'b1'], ['r1', 'f1', 'k1'], ['w2', 's2', 'b2']];
/** Stage 3: the same without "besteht aus"; every card is a right answer in an example before it is a wrong one. */
export const CARD_STEPS: readonly (readonly FactKey[])[] = [['w1', 's1', 'b1'], ['r1', 'f1'], ['w2', 's2', 'b2']];

/** Stage 2: taking in against passing on, protecting against carrying. */
export const TASK_PARTNERS: Partial<Record<FactKey, readonly string[]>> = { s2: ['wurzeln'], w1: ['stamm'], r1: ['stamm'] };
/** Stage 3: the card easily mixed up with the right one. */
export const CARD_PARTNERS: Partial<Record<FactKey, readonly FactKey[]>> = {
  s1: ['r1'], s2: ['r1', 'w1'], w1: ['s2'], w2: ['s2'], r1: ['s1'],
};

/** The tree part to light up for a key of any stage. */
export function partOf(stage: number, key: string): Part {
  if (stage === 1) return key as Part;
  const part = FACTS[key as FactKey].part;
  return part === 'blaetter' ? 'blatt' : part;
}
