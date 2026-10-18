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

export const maxBriefValueChars = 12288;

export const briefTooLong = (
  brief: Readonly<Record<string, string>>,
): boolean => Object.values(brief).some((value) => value.length > maxBriefValueChars);

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

const conversationalPatterns: ReadonlyArray<RegExp> = [
  /^(hi+|hello+|hey+|yo+|sup|hiya|howdy|wagwan|wassup|good (morning|afternoon|evening|night))( there)?[.,!? ]*$/,
  /^(thanks|thank you|thx|ok+|okay|got it|cool|nice one|great|bye|goodbye|see you|carry on|go ahead)([,.!? ]+(thanks|thank you|ok+|okay|got it|looks good|good|then))*[.,!? ]*$/,
  /^(how are you|how'?s it going|how is it going|how far|how'?s work|are you (there|working|done))[? ]*$/,
  /^(what (is|was|'?s) (the )?(work|task|job|brief|shift)( you were hired for)?|what were you hired (for|to do)|what'?s your (job|task|brief|role|progress|status|update)|what are you (doing|working on)|how is (the |your )?(work|task|job|shift|it) (going|progressing)|give me (an )?update)[? ]*$/,
];

export const isConversational = (text: string): boolean =>
  matchesAny(conversationalPatterns, text);

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