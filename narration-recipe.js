/* narration-recipe.js — GENERATED FILE, DO NOT EDIT.
 *
 * The browser's copy of the spoken-text recipe: it removes anything that
 * would give the answer away from the words read aloud (years, decades,
 * date ranges, centuries), then repairs the sentence left behind.
 *
 * Source of truth: tools/narration/text.mjs, between the mirror markers.
 * Recipe: strip-years-v2 · source hash: 3a77c474746f
 * Regenerate: npm run gen:recipe   ·   Verify: npm run validate:recipe
 *
 * narration.js must stay the only consumer; load this before it.
 */
(function () {
  "use strict";


  /** Recipe id recorded in `deck.narration.textRule`. Bumping this
   *  invalidates every `textHash` and forces regeneration (§19.12.5). */
  const RECIPE = "strip-years-v2";

  /** Below this many characters a stripped string is degenerate
   *  ("The War of") and is dropped rather than spoken. */
  const MIN_SPOKEN = 12;

  const ERA = "BC|BCE|AD|CE";

  /** Units that make a big number a measurement, not a date. */
  const UNIT =
    "years?|yrs?|people|inhabitants|miles|kilomet\\w*|metres?|meters?|men|soldiers|sailors|ships|boats|tonnes?|tons|books|languages|species|volumes?|pages?|steps?|feet|km|mi|mm|cm";

  /** Words that turn a following number into a date. */
  const PREP =
    "in|by|from|since|until|till|during|after|before|around|about|circa|near|early|late|mid|of|c\\.|ca\\.";

  const ORDINAL = "(?:1?\\d|2\\d)(?:st|nd|rd|th)";
  const SPELLED_CENTURY =
    "first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|twenty-first";

  /** A number that may be a year: plain, or the thousands-comma form. */
  const YEARNUM = "(?:\\d{1,3},\\d{3}|\\d{1,4})";

  /** Year patterns, in removal order. Detection and removal share these
   *  entries, so the gate can never disagree with the generator. */
  const YEAR_PATTERNS = [
    // Any parenthetical carrying a digit is a gloss in this corpus —
    // "(c. 2550 BCE)", "(313)", "(1861–65)", "(8th–13th c.)" — while
    // "(Orwell)", "(the Nicene Creed)" and "(Heller)" carry meaning and
    // are kept.
    { name: "dated parenthetical", re: /\([^)]*\d[^)]*\)/g },
    {
      name: "range",
      re: new RegExp(`\\b\\d{1,4}s?\\s*(?:–|—|-|to)\\s*\\d{1,4}s?(?:\\s*(?:${ERA}))?\\b`, "g"),
    },
    // 8th–13th, 19th–20th (century ranges written as ordinals)
    {
      name: "ordinal range",
      re: /\b\d{1,4}(?:st|nd|rd|th)\s*(?:–|—|-|to)\s*\d{1,4}(?:st|nd|rd|th)\b/g,
    },
    { name: "era year", re: new RegExp(`\\b${YEARNUM}s?\\s*(?:${ERA})\\b`, "gi") },
    // Three digits or more only: "in 1826", "by 1500", "from c. 450" are
    // dates, but "at 25" or "by age 25" are not. The replacement keeps
    // the preposition when a noun phrase follows it (see removeYearSpans).
    {
      name: "preposition + year",
      re: new RegExp(
        `\\b(${PREP})\\s+(?:(the)\\s+)?(?:\\d{1,3},\\d{3}|\\d{3,4})s?\\b(?!\\s*-?\\s*(?:${UNIT}))`,
        "gi"
      ),
      keepPrep: true,
    },
    {
      name: "bare year",
      re: new RegExp(`\\b(?:1[0-9]{3}|2[0-9]{3})s?\\b(?!\\s*-?\\s*(?:${UNIT}))`, "g"),
    },
    {
      name: "ordinal century",
      re: new RegExp(`\\b(?:the\\s+)?${ORDINAL}[\\s-]+centur(?:y|ies)\\b`, "gi"),
    },
    // the corpus' own abbreviation: "A 19th-c. revival", "the 8th-c. peak"
    { name: "century abbreviation", re: /\b(?:the\s+|\d{1,4}(?:st|nd|rd|th)[\s-]+)c\./gi },
    {
      name: "spelled century",
      re: new RegExp(`\\b(?:the\\s+)?(?:${SPELLED_CENTURY})[\\s-]+centur(?:y|ies)\\b`, "gi"),
    },
  ];

  /**
   * Year-like spans still present in `text`. Used by the gate and by
   * --dry-run to prove a spoken line cannot give the answer away.
   * @param {string} text
   * @returns {Array<{ name: string, match: string }>}
   */
  function yearLeaks(text) {
    const s = String(text || "");
    const out = [];
    for (const { name, re } of YEAR_PATTERNS) {
      const rx = new RegExp(re.source, re.flags);
      let m;
      while ((m = rx.exec(s)) !== null) {
        out.push({ name, match: m[0] });
        if (m.index === rx.lastIndex) rx.lastIndex += 1;
      }
    }
    return out;
  }

  /* Grammatical debris left behind by a removal. Order matters: the pass
     runs repeatedly, so a word exposed by an earlier repair is caught. */
  const REPAIRS = [
    // an emptied parenthetical: "()" or "( )" or "[]"
    [/\(\s*\)|\[\s*\]/g, ""],
    // a stranded date marker: removing "c. 4004 BC" leaves "dated c. by
    // the Ussher chronology". Guarded so initials ("C. S. Lewis") survive.
    [/\s*\b(?:circa|ca\.|c\.)(?=\s*[,.;:!?)]|\s*$|\s+[a-z0-9])/gi, ""],
    // doubled stops: "completed c.." → "completed."
    [/\.{2,}/g, "."],
    [/[,;:]\s*\./g, "."],
    // a word whose object was the removed date — "anchored near 4004 BC."
    // → "anchored.", "in the 1800s." → "in the." → "", "through 1989."
    // → "through." → "". Articles are included so nothing is left
    // dangling before a full stop; the pass repeats to catch the second
    // word once the first has gone.
    [
      /\s*\b(?:in|on|at|by|of|from|to|since|until|till|during|after|before|around|about|circa|ca|near|through|via|across|past|beyond|into|and|but|or|with|as|for|the|a|an|its|his|her|their|our|your|my|this|that|these|those|such|than|then)\b\s*(?=[,.;:!?)]|$)/gi,
      "",
    ],
    // two prepositions in a row once a span went away
    [
      /\b(?:in|on|at|by|of|from|to|since|until|till|during|after|before|around|about|near)\s+(?=(?:in|on|at|by|of|from|to|since|until|till|during|after|before|around|about|near)\b)/gi,
      "",
    ],
    // punctuation hygiene
    [/\s*,\s*(?=[,.;:!?])/g, ""],
    [/\s+([,.;:!?])/g, "$1"],
    [/^[\s,;:.–—-]+/, ""],
    [/\s*[,;:–—-]+\s*$/, ""],
    [/\(\s+/g, "("],
    [/\s+\)/g, ")"],
    [/\s{2,}/g, " "],
  ];

  /** Drop debris, tidy the tail, fix the first letter, add a stop. */
  function tidy(text) {
    let s = text;
    for (let pass = 0; pass < 3; pass += 1) {
      const before = s;
      for (const [re, to] of REPAIRS) s = s.replace(re, to);
      if (s === before) break;
    }
    s = s.trim();
    if (!s) return "";
    s = s.replace(/^(?:and|but|or|so|then|also|which|that)\s+/i, "");
    s = s.charAt(0).toUpperCase() + s.slice(1);
    // A closing quote or bracket may already carry the stop: “utopia.”
    if (!/[.!?]["'”’)\]]*$/.test(s)) s = `${s}.`;
    return s.trim();
  }

  /**
   * Remove year spans from one string to a fixed point, then repair.
   *
   * A string with no year in it is returned exactly as written — no
   * re-punctuation, no re-capitalisation — so "iPhone Launched" stays
   * "iPhone Launched".
   *
   * @param {string} text
   * @returns {string} the spoken form, or "" when nothing usable is left
   */
  function stripYearSpans(text) {
    const original = String(text || "").trim();
    let s = original;
    let removed = false;
    for (let pass = 0; pass < 5; pass += 1) {
      const before = s;
      for (const entry of YEAR_PATTERNS) s = s.replace(entry.re, yearReplacement(entry));
      if (s === before) break;
      removed = true;
    }
    if (!removed) return original;
    s = tidy(s);
    // MIN_SPOKEN only judges text a removal shortened: a short untouched
    // title ("Kush", "Punic Wars") is fine exactly as the deck wrote it.
    if (s.length < MIN_SPOKEN) return "";
    return s;
  }

  /**
   * What a year span collapses to. Plain spans vanish; a date phrase that
   * is followed by a noun phrase keeps its preposition, because the phrase
   * continued past the date: "the eve of the 1832 Reform Bill" → "the eve
   * of the Reform Bill" and "collapses in 1890s Nigeria" → "collapses in
   * Nigeria". When the date ended the phrase the preposition goes with it:
   * "assassinated in 1826 after a long siege" → "assassinated after a long
   * siege", not "assassinated in after…".
   */
  function yearReplacement({ keepPrep }) {
    if (!keepPrep) return " ";
    return (match, prep, article, offset, whole) => {
      const tail = String(whole).slice(offset + match.length);
      const endsPhrase =
        tail === "" ||
        /^\s*[,.;:!?)]/.test(tail) ||
        /^\s+(?:after|before|until|till|and|but|or|when|while|since|that|which|who|to|for|with|as|in|on|by|from|of|during|around|about|near|through)\b/i.test(
          tail
        );
      if (endsPhrase) return " ";
      return ` ${prep}${article ? ` ${article}` : ""} `;
    };
  }

  /**
   * Pronunciation overrides, applied last so they are covered by the
   * hash. Whole-word, case-insensitive. Add an entry only with evidence
   * from the listening pass (`generate.mjs --listen`).
   */
  const LEXICON = new Map([
    // "Ninety-five Theses" — the engine's phonemizer renders the plain word as
    // θəsˈiːz ("thuh-SEEZ": wrong vowel *and* wrong stress). Verified via
    // `pronounce.mjs`: "theeseez" → θˈiːsiːz, an exact match for the dictionary
    // (OALD). A first attempt ("thee-seez" → ðiːsˈiːz) was machine-checked and
    // rejected before shipping. The ear flagged the problem; the machine fixed
    // it. Snapshot enforced by the record in lexicon-records.mjs.
    ["theses", "theeseez"],
    // "Medina" (the hijra card) — the engine says mˈɛdɪnə, "MED-uh-nuh"; the
    // stress is on the wrong syllable, which the audit caught as a
    // disagreement with the dictionary (M AH0 D AY1 N AH0) and the ear
    // confirmed. The hyphen is what buys the fix: it makes the phonemizer
    // treat the name as two words, so the primary stress lands on "deena"
    // instead of the first syllable. Yields mˈʌdˈiːnə — "muh-DEE-nuh", the
    // pronunciation an English speaker reaches for. "medeena" (mˈɛdiːnə) was
    // rejected: right vowel, still wrong stress. Snapshot enforced in
    // lexicon-records.mjs.
    ["medina", "muh-deena"],
    // "Polynesians Settle Aotearoa" — the engine reads the plain word as
    // ˌeɪəɾɛɹˈoʊə ("AY-uh-rair-ROH-uh"): four syllables, wrong vowels, stress
    // in the wrong place. Aotearoa is a Maori name, and there is no English
    // reading for it to fall back on, which is exactly why the audit's
    // proper-noun scan had to learn to look at titles — this word appears in
    // no fact anywhere.
    //
    // The hyphens are the mechanism: they make the phonemizer treat the name
    // as separate words, which forces the five syllables (a-o-te-a-roa) that
    // the plain spelling collapses into four. "ahotearoa" (ˌæhoʊɾɐɹˈoʊə) gets
    // the shape closest but the third syllable too light; the audition sheet
    // put "ao-te-aroa" closest to the Maori. Snapshot enforced in
    // lexicon-records.mjs.
    ["aotearoa", "ao-te-aroa"],
    // "The Hijra" — the engine reads the plain word as hˈeɪɹə, "HY-dra": the
    // r becomes a plain approximant and the j vanishes entirely, so the card
    // names something that is not even recognisably the Arabic hijrah. Confirmed
    // against a period dictionary ("Hijra (hij' ra)") and the Arabic ḥijrah it
    // transliterates. "hij-rah" → hˈɪdʒɹˈɑː — the hyphen is the mechanism, as
    // with "medina" and "aotearoa": it forces the /dʒ/ and puts the primary
    // stress on the first syllable. "Heejra" (hˈiːdʒɹə) and "hidjra" (hˈɪdʒɹə)
    // reach the same consonants and were considered; the short vowel of the
    // first is the closer match. Snapshot enforced in pronounce.mjs
    // lexicon-records.mjs.
    ["hijra", "hij-rah"],
    // "World War II" — the engine reads the Roman numeral as an ordinal in
    // words: ɹˌoʊmən tˈuː, "World War ROMAN TWO". The numeral is not the
    // problem; eSpeak expanding it as a Roman numeral is. These entries spell
    // both numerals out as English numbers, which is how the wars are actually
    // spoken: "World War One", "World War Two". World War I alone was not
    // broken (wˈɜːld wˈɔːɹ ˈaɪ, "World War eye") but the letter reading is not
    // the one we want, so it is spelled out too. \b stops the "I" entry from
    // matching "II", so the two can coexist; the gate's dead-lexicon check
    // confirms both are spoken by some deck.
    ["World War I", "World War One"],
    ["World War II", "World War Two"],
    // "WWII" on its own is the same defect, smaller: eSpeak glues the last
    // "double-you" onto the numeral as dˌʌbəljuːtˈuː, so the syllable boundary
    // between "double-you" and "two" is lost. "WW Two" separates them. There is
    // no "WWI" in the decks, so no matching entry (an unused one fails the
    // gate). Snapshots in lexicon-records.mjs.
    ["WWII", "WW Two"],
    // "Storming of the Bastille" — the engine reads it bˈæstɪl, "BAST-ill",
    // stressing the first syllable. CMUdict says the same (B AE1 S T IH0 L), and
    // that agreement is the trap: English borrowed this name and now spells it
    // with ordinary English letters, so the dictionary records the English
    // reading of those letters. Wiktionary, citing the OED, gives General
    // American /bæˈstil/ and Received Pronunciation /bæˈstiːl/ — both with the
    // stress on the SECOND syllable, and the word rhymes -iːl either way.
    // "bas-teel" -> bˈæstˈiːl, the Received Pronunciation form, which is the one
    // that keeps the /iːl/ rhyme audible.
    //
    // The French is /bas.tij/ and is deliberately NOT used: this is an
    // English-language deck and the name a learner meets in English books is
    // "the Bastille", so the English reading serves them better and stays
    // consistent with every other borrowed name in the decks.
    //
    // Lowercase "teel" on purpose. Capital "TEEL" phonemises the same here, but
    // the fallback voice reads this string through speechSynthesis, which may
    // spell an all-caps word out letter by letter. The same reasoning keeps
    // every other entry lowercase.
    //
    // How this word came to the audit at all is in BORROWED_NAMES (audit.mjs):
    // it appears in no fact, only in a card title, and its dictionary entry is
    // what had been hiding it.
    ["bastille", "bas-teel"],
    // The 2026-09-30 backlog pass over this deck's 16 no-reference words. Each
    // respelling below was chosen by looking the word up, then confirmed against
    // the engine's own phonemizer; the evidence and the reasoning live in
    // lexicon-records.mjs, and that file is what the tests hold this to. The
    // comments here are the long form, not the authority.
    //
    // "Babur" — bˈæbɜː, "BAB-er": the wrong vowel in both syllables. The founder
    // of the Mughal Empire is "bah-BOOR" in English historical usage. "bah-boor"
    // gives bˈɑːbˈoːɹ. Note the phonemizer puts a primary stress on every
    // hyphen-separated chunk, so both syllables are marked; that is an artefact
    // of the mechanism (it is also how "medina" works) and the vowels are the
    // part that matters here.
    ["babur", "bah-boor"],
    // "Cleisthenes" — klˈɛsθiːnz, "KLES-θeenz": the /sθ/ cluster is not how the
    // name is said, and the second vowel is /ɪ/ ("thin"), not /iː/ ("teen").
    // "klys-thin-eez" gives klˈaɪzθˈɪnˈiːz, which is Wikipedia's
    // /ˈklaɪsθɪniːz/ "KLYS-thin-eez" phone for phone. (The /z/ is
    // eSpeak voicing the /s/ of the respelling; the phone sequence is the point.)
    // This replaced "kly-stee-neez", which no source supports — see the record.
    ["cleisthenes", "klys-thin-eez"],
    // "Tenochtitlan Founded" — "Mexica" mˈɛksɪkə, "MEK-si-kuh": wrong on both
    // counts. The Nahuatl Mēxihco is anglicised "meh-SEE-ka", which is also the
    // form the Mexica/Aztec terminology debate uses. "meh-see-ka" gives
    // mˈɛsˈiːkˈɑː.
    ["mexica", "meh-see-ka"],
    // "Babur Founds the Mughal Empire" — "Mughal" mˈoʊɡəl, "MOE-gul". That is
    // the reading of "mogul" the business sense, from Persian moġol. The dynasty
    // is Persian muġūl, "MOO-gul". "moo-gul" gives mˈuːɡˈʌl. The second syllable
    // lands nearer "guhl" than "gool" — the respelling cannot hold a long /u/
    // there — but the first vowel is the one that was wrong.
    ["mughal", "moo-gul"],
    // "Odoacer Deposes the Last Western Roman Emperor" — ˈoʊdoʊsɚ, "OH-doh-ser":
    // the /eɪ/ of "-acer" is missing entirely and the stress is on the wrong
    // syllable. Wiktionary gives UK /ˌɒdəʊˈeɪsə/ and US /ˌoʊdoʊˈeɪsər/ — the one
    // entry here with a URL behind it. "odo-ay-cer" gives ˈoʊdoʊˈaɪsˈɜː.
    ["odoacer", "odo-ay-cer"],
    // "Mansa Musa's Pilgrimage to Mecca" — mˈænsə, "MAN-suh". Mansa is from
    // Arabic mansūf via Mandinka, and the standard English rendering is "MAN-soo".
    // "man-soo" gives mˈænsˈuː.
    ["mansa", "man-soo"],
    // "Augustus Establishes the Roman Principate" — pɹˈɪnsᵻpˌeɪt, "PRIN-si-pate":
    // the ending should be /ət/, "put", not /eɪt/. "prin-suh-put" gives
    // pɹˈɪnsˈʌpˈʊt, which is the reading in every Roman history text.
    ["principate", "prin-suh-put"],
  ]);

  // Characters that mean something to a regular expression. A lexicon key is a
  // WORD OR NAME, never a pattern, so all of these must be inert. The list is
  // the ECMAScript metacharacters; `/` is absent because this is compiled with
  // the RegExp constructor rather than a literal, where it needs no escape.
  const REGEX_METACHARACTERS = /[.*+?^${}()|[\]\\]/g;

  /** True for a character that \b treats as part of a word. */
  const WORD_CHAR = /[\p{L}\p{N}_]/u;

  /**
   * Compile one lexicon key into a matcher that treats the key as LITERAL TEXT.
   *
   * This used to be `new RegExp(`\b${from}\b`)`, which quietly made every key a
   * pattern. Two silent failure modes followed, and neither turned the suite
   * red: a key containing a dot matched any character ("a.b" also rewrote
   * "axb"), and a key containing parentheses opened a capture group, so
   * "cote (divoire)" never matched anything at all. Eight shipped keys happen
   * to be metacharacter-free, which is luck rather than design — the audit's
   * backlog is 159 exotic proper nouns, which is exactly the shape of name that
   * trips this.
   *
   * The boundary guards are chosen per edge rather than blanket `\b`, because
   * `\b` is wrong when a key does not start or end on a word character: for
   * "cote (divoire)" the trailing `)` is a non-word character, so a trailing
   * `\b` would demand a word character next and the key would match nothing.
   * Word-character edges keep `\b`; non-word edges get no guard, which is safe
   * here because such a key already begins or ends on a distinctive character.
   *
   * Known limitation, documented rather than papered over: `\b` is ASCII-only,
   * so it does not see `ā` or `ñ` as word characters. Every current key has an
   * ASCII word character at both ends, and the word-boundary tests pin that.
   *
   * The returned pattern is deliberately NOT global: a /g regex is stateful
   * under .test() because lastIndex persists between calls, which turns the
   * second assertion about any pattern into a different question. `applyLexicon`
   * adds the global flag itself, where String.replace needs it.
   */
  function compileLexiconKey(from) {
    const key = String(from ?? "");
    const literal = key.replace(REGEX_METACHARACTERS, "\\$&");
    const lead = WORD_CHAR.test(key[0] ?? "") ? "\\b" : "";
    const tail = WORD_CHAR.test(key[key.length - 1] ?? "") ? "\\b" : "";
    return new RegExp(`${lead}${literal}${tail}`, "i");
  }

  function applyLexicon(text) {
    let s = String(text || "");
    for (const [from, to] of LEXICON) {
      // The global flag is added HERE rather than baked into compileLexiconKey:
      // a /g regex is stateful under .test() (lastIndex persists between calls),
      // which silently turns any second assertion into a different question.
      s = s.replace(new RegExp(compileLexiconKey(from).source, "gi"), to);
    }
    return s;
  }

  /**
   * The exact words spoken for a card: title, then fact, both
   * year-stripped. A title whose year IS the answer ("The War of 1812",
   * "1984 (Orwell)") degrades to nothing usable and is dropped, so the
   * fact is spoken alone.
   *
   * @param {{ title?: string, fact?: string }} event
   * @returns {string}
   */
  function spokenText(event) {
    const title = stripYearSpans(event && event.title).replace(/[.]$/, "");
    const fact = stripYearSpans(event && event.fact);
    const parts = [title, fact].filter(Boolean);
    if (!parts.length) return "";
    return applyLexicon(parts.join(". "));
  }

  window.NarrationText = {
    recipe: RECIPE,
    sourceHash: "3a77c474746f",
    RECIPE: RECIPE,
    stripYearSpans: stripYearSpans,
    yearLeaks: yearLeaks,
    spokenText: spokenText,
    applyLexicon: applyLexicon,
  };
})();
