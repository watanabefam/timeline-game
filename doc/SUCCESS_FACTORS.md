# Educational-App Success Factors — Research Incorporation

**Status:** research note. This is **not** a spec. Where it disagrees with
`AGENTS.md`, `doc/GAMIFICATION_BRIEF.md`, or `doc/MARKET_COMPARISON.md`, those
documents win.

**Provenance:** the corpus in Appendix A arrived from a Voilà conversation as
task brief `20260911_233326_dacc63` (2026-09-11), titled *"incorporate above
findings into timeline-game research."* Appendix A reproduces it **verbatim and
unedited** as the source of record; the analysis above it is new work.

**Verification:** all statements about this repo were read from the working tree
on 2026-09-11 (`npm run validate` passes; 103 opt-in field warnings). All
statements about the corpus's sources were checked against the live pages on the
same date; where a page could not be retrieved, that is stated.

---

## 1. Verdict

- The corpus is a **practitioner synthesis about company success**, not a study
  of learning outcomes. It carries **no effect sizes, no controls, and no
  peer-reviewed source**. Grade it **D as causal evidence** — the attributions
  ("X succeeded because Y") are retrospective narrative from app roundups, a
  founder podcast, and one investor portfolio post.
- Grade it **B as a demand/retention signal**, because its three most actionable
  claims (habit loop, shareable results, no-friction free entry) are
  independently corroborated by the competitor evidence already compiled in
  `doc/MARKET_COMPARISON.md` §2 and §5.2.
- **Every actionable item that applies here is already in this repo's documents,
  or already implemented.** The corpus adds corroboration and one genuinely new
  emphasis: *user-shared content is the growth loop*. It changes no ratified
  decision.
- Two integrity defects must be recorded so the corpus is never quoted as
  support: `[4]` and `[14]` are EdTech Digest interviews (Kno 2011, BenchPrep
  2014) that **do not concern any of the seven apps named**, and **6 of its 15
  declared sources are never cited in the body** (`[2] [5] [7] [8] [14] [15]`).

---

## 2. What this corpus is — and is not

| Dimension | Assessment |
|---|---|
| Evidence type | App roundups, agency/SEO blogs, an affiliate review site, one VC portfolio post, one 2016 tech-press profile, one 2019 education-press feature, one 2-hour founder podcast, one LinkedIn article. **Zero peer-reviewed items.** |
| Numbers present | Company-reported scale only: Duolingo "100M+ monthly users" (podcast), Quizlet "50M active users / 300M study sets" (EdSurge, 2019), Seesaw "200k classrooms / 25k schools / 100 countries" (TechCrunch, 2016). **None of these is a learning outcome**, and none is an effect size. |
| Method | Post-hoc attribution. Survivorship bias by construction (only winners listed); no failures examined; no counterfactual; mechanisms credited that were added years after initial traction (e.g. streaks on Duolingo). |
| Dead weight | `[4]` interviews the founder of **Kno** (defunct digital-textbook app); `[14]` interviews **BenchPrep** (test prep). Neither product is among the seven apps. The embedded Trustpilot badge image is not a source at all. |
| Usable as | A **mechanism checklist** — habit loop, friction reduction, shareability, review-driven iteration, workflow fit — to be tested against in-repo evidence. |
| Not usable as | A priority ranking, a rationale for a roadmap item, or support for any commercial claim. |

---

## 3. Repo state used for the mapping (verified 2026-09-11)

| Fact | Evidence |
|---|---|
| 3 decks, 274 events | `decks/world-history.js` 33 · `decks/classical-conversations.js` 161 · `decks/world-literature.js` 80 (year/title/fact counts agree per deck) |
| Content gate healthy | `npm run validate` → "All events pass the fact-quality rule (103 opt-in warning(s))" |
| No accounts, no ads, no IAP, static hosting, offline-capable | `AGENTS.md`; `doc/MARKET_COMPARISON.md` §5.1 |
| Shareable result **text** already ships | `shareText()` + `#share-btn` in `timeline.js` (~lines 2234, 2463) |
| "Streak" is **not** a retention mechanic | `game.streak` is a run of consecutive correct placements driving SFX pitch/juice (`timeline.js` 1589, 2032–2106). The retention streak is *planned* in `doc/GAMIFICATION_BRIEF.md`, not built. |
| No leaderboard, no review log, no FSRS | absent from first-party code; log is specified in `AGENTS.md` + brief §6–§7 |
| Single game mode | `modeLabel()` (~1660) returns the deck name; wrong placements bounce back, so the loss branch referencing `ENDLESS_LIVES` (~2181) is unreachable. `#mode-tag`/`#result-tag` still render the literal `DAILY`, a vestigial label, **not** a daily-puzzle loop. |

**Doc drift found while mapping** (fix on its own commit, not here):
`README.md` line 96 still advertises "lives, daily seed"; `doc/MARKET_COMPARISON.md`
§3 marks "Daily challenge ❌" — correct in the sense of *shared Wordle-style daily
puzzle*, but the two statements together imply a mode that does not exist. Say
"single mode; no daily-puzzle loop" in both.

---

## 4. Finding-by-finding incorporation

### 4.1 The seven app stories

| Corpus finding | Applies here? | Current state | What it changes |
|---|---|---|---|
| **Duolingo** — gamified bite-sized lessons, streaks, free entry, habit formation | **Yes, but already governed** | Streak/level/achievement layer is ratified in `doc/GAMIFICATION_BRIEF.md` (D1–D8, A1–A6) with *peer-reviewed* sources (brief §14), which outrank this corpus. Sessions are already short (small counts, `MIN_PLACEMENTS`, focus rounds). Free entry holds. | Nothing new. Confirms D1/D2 direction. **Do not** import "friendly competition" — see §5. |
| **Khan Academy** — free, credible, broad coverage, teacher-friendly | Partly | Free/credible already true. "Broad coverage" is the one to reject: the strategy here is a focused job done well via pluggable decks. The corpus's own common-reason #1 says the same thing about focus. | Content **depth** (MARKET_COMPARISON §5.2 #2), not subject breadth. |
| **Coursera** — prestige partners, credentials, career value | **No** | K–8/homeschool product. | Nothing. Out of scope (§8). |
| **Quizlet** — simple core product, collaborative sharing, network effects | **Yes — the most useful item in the corpus** | Core is simple (docs → filters → Start). What is absent is *user-to-user content flow*: result text is shareable, decks are not. | Promotes deck **import/export/sharing** (MARKET_COMPARISON §5.2 #6) from "differentiator" to *the* organic-growth mechanic (§6.2). Verified basis: Quizlet's growth came from student-created sets ([11], EdSurge 2019, verified — 300M study sets). |
| **SplashLearn** — review-driven iteration; profitability from day one; parent-facing value | Process: **yes**. Monetization: no | No review intake of any kind exists; no store listing yet. | Adopt a written feedback loop — the practitioner version of the learner-testing protocol in the sibling applicability plan (R11). Monetization lesson does not apply while the game is free/no-IAP (§5, §9 Q1). |
| **Seesaw** — fit a real classroom workflow; teacher utility; school adoption | Partly (portfolio-level) | The game already fits a real workflow: deck → filters → CC week tags → Start. Teacher/parent surfaces live in `common-framework/teacher-dashboard.html`, outside this repo. | Reinforces the workflow-fit thesis (and CC week tagging) rather than adding work here. US-district sales path: out of scope. |
| **Socratic** — solves a painful problem fast; grows organically under time pressure | **Partly, and with a hard limit** | The game is deliberately a *retrieval* task with forgiving failure (README "Learning rationale"; brief A6 productive-failure guardrails). | Take the distribution lesson (a tool students hand to each other), **not** the product lesson: no "just show me the answer" affordance. Any hint must preserve retrieval effort. |

### 4.2 The six "common reasons" and four founder lessons

| Corpus claim | Where it already lives here | Verdict |
|---|---|---|
| 1. Solve a painful, specific problem; don't teach everything | Deck-pluggable, single-loop design (`AGENTS.md` product direction) | Already satisfied |
| 2. Reduce friction; short, easy to start | Fixed script load order, no build step, no account, Start disabled only on empty filters | Already satisfied |
| 3. Build habit and engagement (progress, feedback) | `GAMIFICATION_BRIEF.md` D1–D8; per-event accuracy, focus rounds, stats screen | Already planned, better sourced |
| 4. Earn trust through quality and credibility | Content gate (`npm run validate`), honest circa dating, in-repo learning rationale with citations | Already satisfied |
| 5. Grow through word of mouth | Shareable result text only | **Gap** → deck sharing (§6.2) |
| 6. Fit a real learning environment | Homeschool lesson flow, CC week/continent filters, tablet-capable static page | Already satisfied |
| F1. Start from a real pain point | Same as #1 | Already satisfied |
| F2. Design for repeat use with visible progress | FSRS review log + mastery (brief §6–§7) — still **unbuilt** | Backlog (unchanged priority) |
| F3. Use feedback aggressively | No loop exists in this repo | Adopt (§6.3) |
| F4. Let organic growth compound | Share text exists; no content loop | Adopt (§6.2) |

**Net:** the corpus schedules **no new engineering work**. It sharpens one
backlog item (deck sharing) and adds one process item (review intake).

---

## 5. Conflict ledger — where this corpus must NOT be followed

| Corpus advice | Conflicts with | Resolution |
|---|---|---|
| "Friendly competition" as a Duolingo success factor | `GAMIFICATION_BRIEF.md` D6 (leaderboards local, opt-in, **off by default**) and §10 ("global or default-on leaderboards — consistent negative finding for low performers") | **Brief wins.** The brief's sources are peer-reviewed; the corpus has none. |
| Streak mechanics as a growth engine (plus the genre's streak-repair/hearts monetization) | D1 (streak decoupled from score), D2 (forgiveness), §10 (no hearts/lives, no streak-repair purchases, no anxiety notifications) | Take the habit loop, reject the monetization pattern. Already decided. |
| Monetization lessons: freemium, IAP, subscriptions, "profitability from day one", ad-supported tiers | `AGENTS.md` product direction; MARKET_COMPARISON §5.1 (free/no-ads/no-IAP is the differentiator) | Not applicable today. Becomes relevant only if the game itself is sold — see §9 Q1. |
| "Broad subject coverage" (Khan) | Focused-job design; pluggable decks | Grow depth, not breadth. |
| Prestige/credentials positioning (Coursera) | K–8 homeschool context; trust is the currency, not credentials | Reject. |
| Instant-answer homework help (Socratic) | README learning rationale (retrieval + feedback beats answer delivery); brief A6 | Reject the affordance, keep the distribution insight. |
| "Teacher utility → district adoption" (Seesaw) | This repo's channel is the homeschool/tutor lesson, not US districts | Portfolio-level consideration only (`common-framework/`). |

---

## 6. Concrete deltas to this repo's research and backlog

**6.1 Existing priorities — supported, not upgraded.** MARKET_COMPARISON §5.2
#1 daily challenge, #3 shareable result grid, #4 streak tracking each gain a
second, independent practitioner line of support. Their *priority* is unchanged
and their *evidence grade* stays practitioner — this corpus cannot raise it.

**6.2 One emphasis change: deck sharing is the growth mechanic.** Quizlet's
verified growth engine was user-created content, not marketing ([11]). For a
static, backend-free app the only organic loop is **the artefact a learner can
hand to another learner**: today that is the result text; next it should be a
deck. Concretely: make the existing export path produce a self-contained,
shareable deck (URL fragment or file) — no backend required, consistent with
rule 1. This raises §5.2 #6 from "differentiator" to "growth".

**6.3 One new process item: a written feedback intake.** SplashLearn's
verifiable practice — the CEO reads the day's reviews every morning ([9], Accel
2021, verified) — is the practitioner form of the learner-testing loop the
sibling applicability plan already specifies (R11). Adopt both: a short session
protocol for real learners, and an explicit place for parent/teacher/player
feedback to land (currently reviews and feedback have nowhere to go).

**6.4 What does not change.** The gamification layer, the mastery/FSRS log, the
content gate, deck focus, and the free/no-IAP posture are all either ratified or
already implemented. Nothing in the corpus justifies re-opening them.

**6.5 Do not cite this corpus commercially.** No effect sizes exist in it, two
of its sources do not support their attributions, and 6 of 15 are never cited.
`courses/English (Orton-Gillingham)/commercial-plan.md` must not quote it.

---

## 7. Source-by-source (relevance to `timeline-game`)

Ratings: **High** = usable here, verified · **Medium** = usable as context ·
**Low** = marketing/roundup only · **Nil** = not usable.

| Ref | Source (host) | What it actually is (checked 2026-09-11) | Relevance | Usable for / flags |
|---|---|---|---|---|
| [1] | apptunix.com/blog/top-10-educational-apps | **Verified.** App-development agency lead-gen post, "Top 10 Education Apps… 2026", updated 2026-03-10; monetization-model section sells agency services | Low | Landscape vocabulary only. Flag: vendor content, no data |
| [2] | kidsai.app | **Not examined** — never cited in the body | Nil | — |
| [3] | bestreviews.net/best-educational-apps | **Verified.** Affiliate review site, "Last updated: Jul 14, 2025", editor's-rating blurbs | Low | Flag: affiliate monetization; no method |
| [4] | edtechdigest.com (2011-09-01) | **Verified.** Interview with Osman Rashid about **Kno** (digital textbooks, since defunct) | **Nil** | Flag: cannot support any claim about the seven named apps |
| [5] | mktclarity.com | Not examined — never cited | Nil | — |
| [6] | techcrunch.com (2016-06-25) | **Verified.** "How Seesaw accidentally became a teacher's pet at 1/4 of US schools" — Shadow Puppet pivot, word-of-mouth growth | **High** (for the workflow-fit lesson) | Usable: adoption came from fitting an existing workflow. Flag: 2016; pre-dates current scale |
| [7] | thejournal.com (2013-08-20) | Not examined — never cited | Nil | — |
| [8] | spaceotechnologies.com | Not examined — never cited | Nil | — |
| [9] | accel.com (SplashLearn story, pub. 2021-09-02) | **Verified.** Investor portfolio post: CEO Arpit Jain reads the day's reviews every morning; bootstrapped to profitability | **High** (process) | Usable: review-intake discipline (§6.3). Flag: investor-authored, uncritical |
| [10] | youtube.com/watch?v=B9sEJurtZIU | **Verified to exist.** 20VC interview with Duolingo co-founder/CTO Severin Hacker (2025-05-19, 1h57m). Chapters cover AI pivot, hiring, company mistakes — **no streak/gamification segment** | Low | Usable as founder-source colour only. Flag: does not substantiate the gamification claims attached to it |
| [11] | edsurge.com (2019-08-20) | **Verified.** Quizlet / Andrew Sutherland feature: 50M users, 300M+ study sets, collaborative sets, student-first origin | **High** | Usable: user-created content as the growth loop (§6.2). Flag: 2019 figures |
| [12] | linkedin.com/pulse (Tiago Mateus) | **Not retrievable** (auth-wall; the extractor returned a mismatched cached page) | Unverifiable | Flag: load-bearing for the Socratic "organic growth" claim — replace or drop |
| [13] | fastercapital.com/topics/success-stories-from-edtech-startups | **Not retrievable** (HTTP 403, Cloudflare challenge) | Unverifiable | Flag: load-bearing for the Duolingo/Khan/Coursera/Quizlet claims; aggregated topic page — replace with primary sources |
| [14] | edtechdigest.com (2014-02-28) | **Verified.** Interview with BenchPrep's founders (test prep) | **Nil** | Flag: unrelated to the named apps; never cited |
| [15] | foxbusiness.com | Not examined — never cited | Nil | — |
| — | Trustpilot company-rating image | **Not a source.** A rating badge URL (businessUnitId `614b617695594d001df80f2b`) | **Nil** | Remove from any reuse of this corpus |

**Citation audit (from the corpus itself):** 15 sources declared, **9 cited**
(`[1][3][4][6][9][10][11][12][13]`), **6 never cited**
(`[2][5][7][8][14][15]`). Every claim in the "Top educational apps" section
except Quizlet's rests on `[13]`, which could not be retrieved.

---

## 8. Explicitly out of scope

- Coursera-style credentials, university partnerships, career-upskilling framing.
- App-store distribution, ASO, paid acquisition, ad-supported or subscription
  monetization for this repo.
- US school-district sales motion (Seesaw's channel).
- Any competitive/social mechanic (leaderboards, leagues, public profiles) —
  D6 and §10 already forbid it.
- Any "instant answer" affordance (Socratic's actual product).
- Rewriting the gamification layer to match generic streak/XP advice.

---

## 9. Open questions (need the user, not more research)

1. **Is `timeline-game` ever sold** (subscription/IAP), or does revenue stay in
   the course asset? If sold, the corpus's monetization and parent-trust
   findings become load-bearing — and the free/no-IAP differentiator becomes a
   deliberate marketing choice rather than a default.
2. **Is a shared daily puzzle wanted?** It is the niche's strongest proven
   retention mechanic (MARKET_COMPARISON §5.2 #1) and would make the existing
   `DAILY` labels honest — but it is also the kind of daily-gating D3 warns
   against for a spaced-repetition core.
3. **Deck sharing format:** a URL-fragment/file deck export keeps the
   no-backend contract; is that an acceptable substitute for the account-based
   sharing Quizlet used?
4. **Where does feedback land?** A `doc/` protocol plus a repo issue template,
   or a public feedback channel?

---

## Appendix A — Source corpus, verbatim (as received)

> Reproduced character-for-character from brief `20260911_233326_dacc63.md`
> (2026-09-11). Nothing below has been edited, reordered, normalized, or
> trimmed. Analysis lives in §1–§9 above.

Here is a **research** and the main reasons they succeed, drawn from app roundups, reviews, and founder/CEO commentary.

## Executive summary

The most successful educational apps tend to win same few reasons: **they solve a clear learning problem, make practice feel easy or fun, and grow through strong word of mouth rather than heavy advertising**. Across the sources gathered, the strongest examples were **Duolingo, Khan Academy, Coursera, Quizlet, SplashLearn, Seesaw, and Socratic**, with success tied to **product design, accessibility, and trust from learners, parents, and teachers**[1][3][4][6][9][11].

## Top educational apps and why they stand out

###1) Duolingo
Duolingo is repeatedly described as one of the most downloaded education apps, with its success linked to **gamified, bite-sized lessons**, free access, and strong retention mechanics such as points, streaks, and friendly competition[10][13]. Its founders are credited with turning language learning into a **low-friction daily habit**, which makes the app sticky and easy to recommend[13]. 
**Why it succeeds:** **fun design, short lessons, free entry point, and habit formation**[10][13].

###2) Khan Academy
Khan Academy’s appeal comes from its original mission of providing **a free, world-class education for anyone, anywhere**, which helped build trust and scale globally[13]. The app is valued for its broad subject coverage and its clear, teacher-friendly instructional style, which makes it useful for both independent learners and classrooms[1][13]. 
**Why it succeeds:** **mission-driven free access, credibility, and broad usefulness**[13].

###3) Coursera
Coursera became a leading education platform by connecting learners with **top universities and expert instructors**, making high-quality learning feel more accessible and career-relevant[13]. Its model succeeds because it bridges the gap between academic content and practical upskilling, which appeals to learners seeking credentials, job mobility, and flexible study[13]. 
**Why it succeeds:** **prestige partnerships, career value, and scalable online delivery**[13].

###4) Quizlet
Quizlet’s growth is tied to the simplicity and utility of digital flashcards, a format that is easy to use, share, and repeat at scale[11][13]. The app’s success has also been linked to its organic spread among students, who create and share study sets in large numbers[11]. 
**Why it succeeds:** **simple core product, collaborative sharing, and network effects**[11][13].

###5) SplashLearn
SplashLearn is highlighted for paying close attention to **online reviews**, with its CEO reportedly checking them daily, showing how product feedback loops can shape a stronger app[9]. Its success story emphasizes **profitability from day one**, which suggests disciplined monetization, user satisfaction, and a clear focus on value delivery[9]. 
**Why it succeeds:** **review-driven iteration, profitability discipline, and parent-facing value**[9].

###6) Seesaw
Seesaw’s success story is notable because it **started as something else** and evolved into widely adopted classroom tool, ultimately becoming widely used in U.S. schools[6]. It resonated because it fit a real classroom workflow and became a practical communication and learning-sharing platform for teachers, students, and[6].**Why it succeeds:** **teacher utility, school adoption, and clear classroom fit**[6].

###7) Socratic
Socratic is cited as an app that grew rapidly through **positive user reviews and organic growth**, showing that strong product-market fit can outperform paid acquisition[12]. Its appeal comes from helping students solve homework and learning problems quickly, which makes it highly shareable among students under time pressure[12]. 
**Why it succeeds:** **clear problem-solving, good reviews, and organic growth**[12].

## Common reasons these apps succeed

###1) They solve a painful, specific problem
Successful apps target concrete needs such as **language learning, test prep, homework help, flashcards, or classroom communication**[1][11][13]. The best products do not try to teach everything at once; they focus on one job and do it well[11][13].

###2) They reduce friction
Apps that keep lessons **short, accessible, and easy to start** are more likely to stick. Duolingo’s bite-sized design and Quizlet’s simple study sets are strong examples of this principle[10][11][13].

###3) They build habit and engagement
Gamification, progress tracking, and frequent feedback create repeat usage. Duolingo is the clearest example, but the pattern also appears in apps that rely on regular practice and visible progress[10][13].

###4) They earn trust through quality and credibility
Educational products have to feel reliable to parents, teachers, and students. Coursera benefits from university partnerships, Khan Academy from mission-driven credibility, and SplashLearn from careful review management[9][13].

###5) They grow through word of mouth
Several success stories highlight **organic growth**, especially through students, teachers, and parents sharing useful tools with others[6][11][12]. In education, trust-based referral loops are often more effective than broad advertising.

###6) They fit a real learning environment
The best apps are designed around how people actually learn: in classrooms, at home, or on the go. Seesaw succeeded because it matched classroom workflows, while Coursera and Khan Academy fit self-directed learning at scale[6][13].

## What reviews and founder stories reveal

Reviews tend to reward apps that are **easy, effective, and pleasant to use**, while founders emphasize **mission, retention, and scalability**. This creates a useful pattern: the apps that win are not always the most feature-heavy, but the ones that are **most consistent at delivering value in a simple format**[9][10][12][13].

A few founder-driven lessons stand out:
- **Start with a real learning pain point** rather than a broad category idea[11][13].
- **Design for repeat use** with short sessions and visible progress[10][13].
- **Use feedback aggressively**, especially from reviews and teachers[9][12].
- **Let organic growth compound**, because educational products spread well when users genuinely benefit[6][11][12].

## Bottom line

The strongest educational apps succeed because they combine **clear educational value, simple design, trust, and habit-forming engagement**. Duolingo, Khan Academy, Coursera, Quizlet, SplashLearn, Seesaw, and Socratic all show that educational software works best when it is **useful first, polished second, and aggressively focused on user retention and real-world learning outcomes**[6][9][10][11][12][13].

If helpful, I can turn this into a **ranked comparison table** of the top educational apps with columns for **target audience, monetization model, and success factors**.

![Image](https://share.trustpilot.com/images/company-rating?locale=en-US&businessUnitId=614b617695594d001df80f2b)





Sources:

- [1] [www.apptunix.com](https://www.apptunix.com/blog/top-10-educational-apps/)
- [2] [kidsai.app](https://kidsai.app/blog/best-educational-apps-2026)
- [3] [bestreviews.net](https://bestreviews.net/best-educational-apps/)
- [4] [www.edtechdigest.com](https://www.edtechdigest.com/2011/09/01/interview-osman-rashid-thinks-you-ought-to-kno/)
- [5] [mktclarity.com](https://mktclarity.com/blogs/news/education-apps-top)
- [6] [techcrunch.com](https://techcrunch.com/2016/06/25/seesaw-education/)
- [7] [thejournal.com](https://thejournal.com/articles/2013/08/20/new-service-reviews-educational-apps.aspx)
- [8] [www.spaceotechnologies.com](https://www.spaceotechnologies.com/blog/edtech-mvp-success-stories/)
- [9] [www.accel.com](https://www.accel.com/news/how-to-build-a-profitable-edtech-startup-from-day-1-the-splashlearn-story)
- [10] [www.youtube.com](https://www.youtube.com/watch?v=B9sEJurtZIU)
- [11] [www.edsurge.com](https://www.edsurge.com/news/2019-08-20-going-to-school-running-a-startup-when-students-build-their-own-edtech)
- [12] [www.linkedin.com](https://www.linkedin.com/pulse/success-stories-bootstrapped-edtech-companies-tiago-mateus-uikbe)
- [13] [fastercapital.com](https://fastercapital.com/topics/success-stories-from-edtech-startups.html)
- [14] [www.edtechdigest.com](https://www.edtechdigest.com/2014/02/28/passing-the-test/)
- [15] [www.foxbusiness.com](https://www.foxbusiness.com/features/a-entrepreneurs-behind-back-to-school-apps)

---

## Appendix B — Citation rule for this corpus

Do not cite it for any causal or quantitative claim. If a mechanism from it is
used, cite instead:

- the **in-repo** document that already justifies it (`doc/GAMIFICATION_BRIEF.md`
  §14 evidence sources; `AGENTS.md` product direction; README "Learning
  rationale"), or
- an **independent in-market** source (`doc/MARKET_COMPARISON.md` §2), or
- the **primary company source** verified in §7 (`[6]`, `[9]`, `[11]`).

Quoting a number from it without naming the measure, the population, and the
vintage is not acceptable — and no number in it is a learning outcome.
