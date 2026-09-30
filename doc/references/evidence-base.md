# Evidence base — learning-science validation of our design patterns

We distilled Duolingo's blog posts into `docs/duolingo-reference/`. This document
validates (or corrects) those patterns against **independent peer-reviewed research**,
not vendor marketing. Each pattern gets a rating and real citations.

Rating scale: ✅ Strong support · 🟡 Moderate / conditional · ⚠️ Inconclusive or
needs care · ❌ Not supported / contradicted.

---

## 1. Spaced repetition + interleaving → ✅ Strong (with one nuance)
Our Stage B/F review injection + `spacedRepetition.ts`.

- **Distributed (spaced) practice**: "High" support in the Dunlosky et al. (2013)
  learning-techniques meta-analysis. Classroom meta-analysis d = 0.54 (Donoghue &
  Hattie, 2021); lab meta-analyses d ≈ 0.85 (Cepeda et al., 2006; Donovan &
  Radosevich, 1999). 3–4 exposures needed; longer gaps (≈7-day) better than cramming.
- **Interleaving**: moderate support overall (g = 0.42 meta-analysis, "Similarity
  Matters", 59 studies; Dunlosky rates it "moderate"). **Nuance worth knowing:**
  the interleaving effect is *strongest for visual/inductive materials* (paintings
  g = 0.67, photographs g = 0.35) and **negative for pure word lists** (g = −0.39).
  → Our grammar symbols are *visual shapes*, so interleaving symbol recognition is
  plausibly in the beneficial (visual) camp, not the word-list camp. This is why
  keeping a visual anchor on every review node matters.
- **Duolingo's own 2024 whitepaper** confirms it at scale: the interleaved linear
  path reached A2+ for 67% (ES) / 69% (FR) of learners vs 66% / 53% on the old tree.
- **Decision: keep interleaving as default** (learning-path.md §1A), but anchor
  every review item to its symbol (don't interleave as bare word lists).

## 2. Graduated scaffold (words → phrases → sentences) → ✅ Strong
Our Stage C (1 symbol→1 word) → D (→2 words) → E (2 symbols) → F (full compound).

- **Scaffolding theory** (Wood, Bruner & Ross, 1976; Vygotsky ZPD): temporary,
  contingent support that *fades* as competence rises; "high challenge, high
  support" (Mariani, 1997; Hammond & Gibbons: "designed-in" + "contingent").
- Maps cleanly to our ladder: heavy support at C, fading toward F. This is
  textbook scaffolding, not a Duolingo invention.

## 3. i+1 / "one step beyond current level" → 🟡 Sound in spirit, but don't cite ZPD
- **Correction:** Krashen's *i+1* (Input Hypothesis) and Vygotsky's *ZPD* are
  **incommensurable constructs** from different theoretical traditions
  (Kinginger, 2009; Penn State). They are NOT the same thing — don't conflate them
  in any write-up.
- **However**, both independently support "input/just-beyond-current" as effective.
  Comprehensible input (Krashen) is well-supported for acquisition; our whole-
  sentence narration = comprehensible input.
- **Decision:** keep the *graduated, one-element-at-a-time* ladder (that's
  scaffolding, #2), but if we document it, say "scaffolded/i+1-style progression,"
  not "ZPD = i+1."

## 4. Per-error "why" feedback (Explain-My-Answer) → ✅ Strong
Our `feedbackCorrect`/`feedbackWrong` + per-symbol Guidebook.

- Corrective feedback (CF) has **medium-to-large, durable effects** across SLA
  meta-analyses (Norris & Ortega, 2000; Russell & Spada, 2006; Li, 2010).
- **Metalinguistic (explain-why) feedback is among the most effective**: written
  metalinguistic d = 1.99, direct written d = 1.54 (technique/timing meta-analysis).
- Lyster & Ranta (1997): grammar errors get the largest share of CF (43%);
  specific, timely feedback beats generic.
- **Decision: keep** — our design (specific per-Q&A explanation) matches the
  research. Add a parent-controlled "verbose vs minimal" toggle (SDT autonomy).

## 5. Montessori grammar symbols / structured literacy → ✅ Strong (pedagogy fit)
- Montessori "Functions of Words" (9 parts of speech), symbols + isolation of
  difficulty, multisensory, concrete→abstract (Montessori.org webinar; Moteaco
  Language 6-9; Montitute manual; Gutenberg #42869). Sensitive period for language
  ages 6–8 — matches our ~7yo target.
- **Independent validation:** Zoll, Feinberg & Saylor (2023), *Powerful Literacy in
  the Montessori Classroom*, aligns Montessori materials with the **Science of
  Reading** (Reading Rope): multisensory, systematic, explicit, structured
  literacy. Grammar materials bridge decoding → comprehension.
- **Caveat (pre-existing):** symbol *colors* vary across Montessori sources (PR #931
  is non-canonical). Keep canonical *shapes/pedagogy*; colors are flexible. Our
  `src/data/symbols.tsx` already treats shapes as authoritative.

## 6. Dyslexia-friendly fonts (OpenDyslexic / Lexend / Atkinson) → ⚠️ Inconclusive — offer as option, don't oversell
This is the most important correction. Our Settings font toggle is fine as an
*accessibility option*, but we must NOT claim clinical efficacy.

- **Mixed evidence.** Broadbent (UCL thesis, KS2): OpenDyslexic improved reading
  *accuracy* and *rate* vs Arial for dyslexic readers; **no effect on comprehension**;
  spacing alone not significant. Suggests a small benefit.
- **But:** the literature is thin and contested. Wery & Diliberto (2017): no effect
  on rate/accuracy. Kuster et al. (2017): Dyslexie font did **not** help. Rello &
  Baeza-Yates: mixed. One adult study found OpenDyslexic improved comprehension vs
  Times New Roman.
- The field consensus: "few methodologically rigorous studies… without empirical
  evidence it may not be prudent to recommend a specific font" (Broadbent).
- **What actually helps more reliably:** increased *letter/word/line spacing* and
  *sans-serif*, not the specific font. → Our high-contrast palette + spacing + clean
  sans-serif does more reliable work than the font glyphs themselves.
- **Decision:** keep the font toggle (low-risk, may help some kids, harms none), but
  frame it as "comfort option," not "proven dyslexia treatment." Prioritize spacing
  + contrast in the base theme.

## 7. Gamification (streaks, badges, mastery) → 🟡 Effective for motivation, with misuse risk
Our StreakBadge + stars + daily goal.

- **Supports motivation** via Self-Determination Theory (autonomy, competence,
  relatedness). Positive link between gamification perception, extrinsic motivation,
  and streak length (Frontiers 2024; UAE EFL mixed-methods study).
- **Risks documented:**
  - *Gamification misuse*: learners fixate on metrics and get distracted from
    learning (arxiv 2203.16175, qualitative study of Duolingo forums + interviews).
  - Can *erode intrinsic motivation* and embed competition/self-surveillance
    (neoliberal critique; JoVE 2024 CDA study).
  - Critic (Bogost, 2011): replaces meaningful incentives with "fictional" ones;
    novelty fades.
- **Our mitigating design choices (already correct):**
  - Local-only → **no leaderboards / friend quests** (the riskiest misuse vectors).
    Good call.
  - Tie rewards to *mastery* (3-star units), not just streaks.
  - "Specific, manageable goals" + per-symbol TIP = SDT *competence*, the durable
    motivator.
- **Decision:** keep streaks/badges as light support, but make mastery the real
  progress signal; never let the streak become the goal.

## 8. Duolingo method efficacy (at scale) → ✅ Supported
- Beginning courses ≈ 4 university semesters in half the time (Duolingo efficacy
  whitepaper, n=225, ACTFL).
- Linear path (interleaved + stories + practice) met/exceeded proficiency
  expectations (2024 whitepaper); Classroom + Duolingo > either alone for pragmatics.
- **Caveat:** these are *language*-learning efficacy studies. The memory/learning
  mechanisms (spacing, scaffolding, retrieval, feedback) transfer to our grammar-
  symbol domain; the specific A2/CELFR numbers do not.

---

## Summary table

| Pattern (from duolingo-reference) | Evidence | Action |
|---|---|---|
| Spaced repetition + interleaving | ✅ Strong (visual nuance) | Keep; anchor reviews to symbol |
| Graduated scaffold (words→sentences) | ✅ Strong (scaffolding theory) | Keep ladder C→F |
| i+1 / one-step-at-a-time | 🟡 Sound, not "ZPD=i+1" | Keep ladder; fix wording |
| Per-error "why" feedback | ✅ Strong (metalinguistic CF) | Keep + parent verbosity toggle |
| Montessori symbols / structured literacy | ✅ Strong (SoR-aligned) | Keep; shapes canonical, colors flexible |
| Dyslexia-friendly font | ⚠️ Inconclusive | Option, not claim; prioritize spacing/contrast |
| Gamification (streak/badge) | 🟡 Motivating + misuse risk | Keep light; mastery > streak; no leaderboards |
| Duolingo method efficacy | ✅ Supported (language domain) | Mechanisms transfer |

## Net
Every pattern we adopted from the Duolingo blog is **independently supported** by
learning science — with three refinements:
1. **Interleaving** is great for *visual* material (our symbols) but weak for bare
   word lists — so keep a visual anchor on review nodes.
2. **i+1 ≠ ZPD** — don't conflate; the ladder is scaffolding.
3. **Dyslexia fonts are unproven** — offer as comfort option, prioritize spacing +
   contrast, don't market as treatment.
And one risk to manage: **gamification misuse** — our local-only/no-leaderboards
stance already mitigates the worst of it; keep mastery as the true progress signal.
