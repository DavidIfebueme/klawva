const normalize = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[_\-‐-―]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const injectionPatterns: ReadonlyArray<RegExp> = [
  /(ignore|disregard|forget|override) (all |any |the |your |my |our )?(previous |prior |earlier |above |preceding |initial |original )*(instruction|prompt|rule|direction|guideline|context)s?/,
  /forget (everything|all) (above|before|prior|previously|preceding)/,
  /(reveal|print|repeat|show|output|recite) (me )?(your |the )?(system |initial |original )?(prompt|instruction|secret)s?/,
  /(system|developer|god) mode/,
  /jailbreak/,
  /do anything now/,
  /pretend (you are|you have no|to be)/,
  /exfiltrat/,
];

const matchesAny = (
  patterns: ReadonlyArray<RegExp>,
  text: string,
): boolean => {
  const haystack = normalize(text);
  return patterns.some((pattern) => pattern.test(haystack));
};

export const screenSoul = (soul: string): string | null =>
  matchesAny(injectionPatterns, soul) ? "soul_flagged" : null;

export const screenBrief = (
  brief: Readonly<Record<string, string>>,
): string | null =>
  Object.values(brief).some((value) => matchesAny(injectionPatterns, value))
    ? "brief_flagged"
    : null;

const offBriefPatterns: ReadonlyArray<RegExp> = [
  /\b(poem|poetry|haiku|sonnet|limerick|riddle)\b/,
  /\b(recipe|recipes|ingredients|bake|baking|baking soda|oven)\b/,
  /\b(horoscope|astrology|zodiac|tarot|palindrome reading)\b/,
  /\b(dating|marriage proposal|first date|boyfriend|girlfriend)\b/,
  /\b(diagnosis|diagnose|symptoms|prescription|my knee|rash on my)\b/,
  /\b(football score|basketball score|match result|who won the)\b/,
  /\b(write me a song|guitar chords|lyrics for)\b/,
];

export type ScopeVerdict = "injection" | "off_brief" | "in_scope";

export type RejectVerdict = Exclude<ScopeVerdict, "in_scope">;

export const screenScope = (
  text: string,
  brief: Readonly<Record<string, string>>,
): ScopeVerdict => {
  if (matchesAny(injectionPatterns, text)) {
    return "injection";
  }
  const values = Object.values(brief);
  if (values.length === 0) {
    return "in_scope";
  }
  const offTopic = offBriefPatterns.filter(
    (pattern) => !values.some((value) => pattern.test(normalize(value))),
  );
  return offTopic.some((pattern) => pattern.test(normalize(text)))
    ? "off_brief"
    : "in_scope";
};

export const steerReply = (verdict: RejectVerdict): string =>
  verdict === "injection"
    ? "I cannot follow instructions that override this shift. Tell me what you need within the brief you hired me for."
    : "That looks outside this shift's brief. Tell me what you need within the work you hired me for and I will get to it.";