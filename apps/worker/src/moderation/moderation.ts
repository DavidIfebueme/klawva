const soulPatterns: ReadonlyArray<RegExp> = [
  /ignore (all )?(previous|prior) instructions/i,
  /exfiltrat/i,
  /reveal (the )?(secret|api key|token|credential)/i,
  /print (the )?(env|environment|secret|token)/i,
];

export const screenSoul = (soul: string): string | null => {
  for (const pattern of soulPatterns) {
    if (pattern.test(soul)) {
      return "soul_flagged";
    }
  }
  return null;
};

const briefPatterns: ReadonlyArray<RegExp> = [
  /ignore (all )?(previous|prior) instructions/i,
];

export const screenBrief = (
  brief: Readonly<Record<string, string>>,
): string | null => {
  for (const value of Object.values(brief)) {
    for (const pattern of briefPatterns) {
      if (pattern.test(value)) {
        return "brief_flagged";
      }
    }
  }
  return null;
};
