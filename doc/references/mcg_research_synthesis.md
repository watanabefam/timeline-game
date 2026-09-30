# MCG Research Synthesis

**Date:** 2026-07-07
**Vendored into this repo:** 2026-09-30 (previously `Education/course-studio/`). In-repo consumers: `doc/GAMIFICATION_BRIEF.md` §4 (amendments A1–A11), which cites this file by § number — "§11" means section 11 *here*, not of that brief. It is **course-content pedagogy**: what transfers to a game is the learning mechanism (spacing, retrieval, feedback depth, interleaving and age gates), never the course template.
**Purpose:** Consolidated research findings across 12 learning-science fronts to inform prompt improvements for MCG course generation.
**Status:** v6 — 24 sections (17 research fronts + 7 cross-front/application sections). Each front includes boundary conditions, anti-patterns, prompt coverage, and research evidence.

---

## 1. Social Presence & Community

### Key Findings
- **Instructor immediacy meta** (Witt et al. 2004, k=81, N=24,474): Nonverbal immediacy → perceived learning r=.51, affective learning r=.49, but cognitive learning r=.17. Verbal immediacy → perceived learning r=.49, affective r=.49, cognitive r=.06. Immediacy has substantial effect on perceptions/attitudes, modest effect on measured cognitive performance.
- Community of Inquiry (CoI) meta-analysis (k=19): Social presence → perceived learning r=.432 (moderate), → actual learning r=.199 (small). Social + teaching presence predict 81% of cognitive presence variance.
- Peer learning second-order meta (k=16): g=0.29 overall (weak). Higher for academic achievement than affective/social skills.
- Peer feedback with instructional support meta (k=32): g=0.47. Content-specific support during provision g=0.75 (strong).

### Boundary Conditions
- **Self-paced vs. synchronous**: Social presence effect is stronger in synchronous/cohort settings. Self-paced courses like MCG's get the perception benefit (r=.43) but not the full cognitive learning lift — design social prompts for reflection, not interaction.
- **Age**: Social presence has stronger effects on motivation for younger learners (5-16) than on adult professional learners who prioritize efficiency over connection.
- **Length**: Effect declines for courses longer than 4 modules — social prompts can feel forced by module 3. Vary prompt type, don't repeat the same pattern.

### Anti-Patterns
- **Fake social**: "Share your answer with your neighbour" when there is no neighbour (self-paced course). Frame as reflection, not interaction.
- **Over-personalization**: Every lesson starting with "Hey there, learning buddy!" — saturates quickly. 1 social prompt per section is enough.
- **Neutral tone**: The default academic-register voice is the anti-pattern. Fix: use INSTRUCTOR_VOICE warm-conversational from GLOBAL_BEHAVIOUR.

### Prompt Coverage
- `<PEDAGOGY> <SOCIAL_PRESENCE>` — instructor persona, welcome, social CTA, reflection prompts
- `<GLOBAL_BEHAVIOUR> INSTRUCTOR_VOICE` — warm-conversational forward-reference
- `<LESSON_TEMPLATE> SOCIAL_PRESENCE_PROMPT` — one social slot per lesson

### Priority: Medium

### Key Sources
- Witt, Wheeless & Allen (2004) — Communication Monographs (immediacy meta, k=81)
- Loh et al. (2024) — Frontiers in Education
- Kaya et al. (2025) — Peer learning second-order meta

---

## 2. Onboarding & First Impressions

### Key Findings
- Zichermann framework: Action → Early Reward → Registration. Key tasks: motivation, orientation, action.
- Digital onboarding tool (Schilling et al. 2025, RCT): Significantly increases informedness, study-related self-efficacy, reduces dropout intention. Effects persisted across first semester.
- Microlearning for onboarding best practices: chunk into small steps, space over time, mobile-first, interactive, narrative structure (learner as main character), early rewards, visual progress indicators.
- **Early attrition risk**: >50% of voluntary attrition occurs in first 6 months without proper onboarding (Brandon Hall). First-lesson experience is critical.

### Boundary Conditions
- **Returning audience**: When the user creates a second course from the same Collection, onboarding can be shorter (2 lessons vs full section). Repeat the transformation and quick win; skip the platform tutorial.
- **Professional audience**: Onboarding should be business-casual, not gamified. Skip character introductions, keep the "early win" as a practical output.
- **Single-module courses**: Onboarding should be 2 lessons max — don't spend 30% of the course on orientation.

### Anti-Patterns
- **Feature tour as onboarding**: "Here's how to use the player controls" instead of "Here's what you'll learn and why it matters." Onboarding motivates, it doesn't instruct on tool use.
- **No early win**: Starting with background theory before any hands-on moment. The learner should DO something in lesson 2 or 3 that feels like progress.
- **Generic welcome**: "Welcome to this course" with no connection to the learner's actual goal or transformation. Always tie to the "from X to Y" statement.

### Prompt Coverage
- `<PEDAGOGY> <ONBOARDING_REQUIRED>` — first section must be onboarding
- `<LEARNING_ARC> ARC_STEPS` — onboarding is step 1
- `<POST_GENERATION_REVIEW> 14_ONBOARDING` — checklist item
- `<LANDING_PAGE_TEMPLATE> quick_win` — early win in landing page

### Priority: Medium

### Key Sources
- Zichermann & Cunningham (2011) — Gamification by Design
- Schilling et al. (2025) — European Journal of Education
- Renz (2014) — EDULEARN MOOC onboarding paper

---

## 3. Accessibility & Inclusion (UDL + Neurodiversity)

### Key Findings
- UDL 3.0 (CAST 2024): Multiple Means of Engagement, Representation, Action & Expression. New focus on "learner agency" over "expert learners."
- Neurodiversity-informed UDL: self-advocacy, honoring communication differences, recognizing personhood beyond labels, supporting executive function.
- ADHD-specific design (Das et al. 2025): calm neutral color palette, minimalist layouts, chapter-based segmentation, AI-generated summaries, visual scaffolds (mind maps), WCAG 2.2 compliance.
- Neurodivergent ≈ 15–20% of population (Kletenik et al. 2024).

### Boundary Conditions
- **17+ professional context**: Accessibility requirements remain (alt text, contrast, keyboard navigation) but UDL's "multiple representations" should not bloat lesson length — text + image is sufficient; don't add audio summaries by default.
- **Platform constraints**: MCG's block system limits representation modes (no native audio block, no interactive transcript). Work within the available blocks; don't invent unsupported formats.

### Anti-Patterns
- **Accessibility as checklist**: "Added alt text ✅" without meaningful descriptions. Alt text must convey the concept, not the image.
- **Consistency as monotony**: Every lesson identically structured → learners stop engaging. Vary block types (cards, numbered-cards, highlights, tabs, accordion) while keeping the template slots the same.
- **Calm palette as grey**: Low saturation doesn't mean colourless. Use muted warm tones, not greyscale.
- **Ignoring instructions_up_front**: Placing an activity without telling the learner what to do first. Every quiz/activity must have a one-line instruction.

### Prompt Coverage
- `<PEDAGOGY> <ACCESSIBILITY_UDL>` — consistent templates, calm palette, instructions upfront, page reader note
- `<PEDAGOGY> <MULTIMEDIA_PRINCIPLES>` — spatial contiguity, signaling, coherence
- `<MULTIMEDIA_DEFAULTS>` — font, accessibility widget, page reader
- `<FAILURE_CONDITIONS> MISSING_ALT_TEXT`
- `<POST_GENERATION_REVIEW> 9_ACCESSIBILITY`

### Priority: Medium

### Key Sources
- CAST (2024) — UDL Guidelines 3.0
- Das et al. (2025) — ADHD e-learning tool study
- Kletenik et al. (2024) — Teaching accessibility for neurodiverse users

---

## 4. Emotional / Aesthetic Design

### Key Findings
- Anthropomorphic faces + pleasant colors: retention d=0.39, transfer d=0.33, comprehension d=0.32 (Brom et al. 2018, k=33).
- Intrinsic motivation d=0.26, reduced perceived difficulty d=-0.21 (Wong & Adesope 2021, k=28).
- Positive emotional design: retention g=0.22, transfer g=0.23, physiological attention g=0.49 (Su et al. 2024, k=15).
- More effective for learners under 18; facial anthropomorphism better for static vs. dynamic materials.

### Boundary Conditions
- **Age**: Effect concentrates in under-18s (d=0.39). For 17+ professional audiences, emotional design should be subtle — clean typography, generous whitespace, no anthropomorphism.
- **Content sensitivity**: For ethics, legal, medical, or safety topics, a warm palette is fine but anthropomorphic faces can feel trivializing. Skip character illustrations; use diagrams and icons instead.
- **Cognitive load risk**: Highly decorative emotional design can increase extraneous load (seductive details effect). Every design element must serve a learning purpose.

### Anti-Patterns
- **Garish colours**: High-saturation palettes that distract rather than engage. Stick to muted warm tones (burnt orange, sage, slate, cream).
- **Anthropomorphic everything**: Adding faces to diagrams that don't need them. Reserve for welcome/introductory content and character-based narratives.
- **Decorative overload**: Borders, gradients, shadows, icons, AND illustrations in one lesson → cognitive load exceeds the emotional benefit.

### Prompt Coverage
- `<PEDAGOGY> <EMOTIONAL_DESIGN>` — warm palette, face anthropomorphism, age-gated
- `<IMAGE_RULES> IMAGE_STYLE` — consistent style descriptors
- `<MULTIMEDIA_PRINCIPLES> COHERENCE` — no decorative overload

### Priority: Medium

### Key Sources
- Brom et al. (2018) — Educational Research Review
- Wong & Adesope (2021) — Educational Psychology Review
- Su et al. (2024) — Emotional design meta with physiological data

---

## 5. Self-Determination Theory

### Key Findings
- **SDT meta-analysis** (Howard et al. 2024, k=637, N=388,912, 8,693 correlations): Autonomy support correlates positively with performance (r=.17), cognitive skills (r=.28), creativity (r=.19), deep learning strategies (r=.33), metacognitive strategies (r=.40), time management (r=.35), goal setting (r=.34). Competence support correlates with deep learning (r=.28). Relatedness support correlates with engagement and well-being.
- **Autonomy support meta** (Mammadov & Schroeder 2023, k=344): autonomy support positively associated with intrinsic motivation, self-efficacy, engagement, and academic achievement across educational levels.
- **SDT interventions meta** (2024): SDT-based interventions significantly improve intrinsic motivation (g=0.45–0.60), autonomy satisfaction, and competence satisfaction.

### Boundary Conditions
- **Professional context**: Autonomy matters more than relatedness. Professionals want control over pace, sequence, and depth; they don't need "buddy" framing.
- **5-11 audience**: Competence support dominates. Clear success criteria, positive reinforcement, and scaffolded difficulty matter more than choice architecture (too much choice overwhelms).
- **Stakes**: Effect is stronger for elective/voluntary learning than mandatory compliance training. For required courses, focus on competence and clear rationale ("why this matters to your role").

### Anti-Patterns
- **False choice**: "Choose your path" where only one path has real content. Every option must lead to actual learning.
- **Over-choice**: 7 optional deep dives in one module. Limit to 1–2 per module so choice is meaningful, not overwhelming.
- **Cold competence**: Providing success criteria without the instruction to meet them. "By the end you will be able to..." must be paired with "Here's how."
- **Relatedness without presence**: Instructor persona that vanishes after Lesson 1. Maintain warm voice throughout, not just in the welcome.

### Prompt Coverage
- `<PEDAGOGY> <SDT_ENGAGEMENT>` — autonomy (choice, optional paths), competence (scaffolded), relatedness (persona)
- `<LEARNING_ARC> ARC_STEPS` — module arc provides structure for competence
- `<COURSE_STRUCTURE> MODULE_COUNT_MIN/MAX` — limits over-choice

### Priority: High

### Key Sources
- Howard et al. (2024) — Personality and Social Psychology Bulletin (SDT meta, k=637)
- Mammadov & Schroeder (2023) — k=344 autonomy meta
- Walker et al. (2024) — Online Learning journal (motivation meta)

---

## 6. Multimedia Principles (Mayer's 12)

### Key Findings
- **Meta-meta-analysis** (Noetel et al. 2021, 29 reviews, 1,189 studies, 78,177 participants): 11 design principles with significant positive effects on learning. Largest benefits: captioning second-language videos, temporal/spatial contiguity, signaling.
- **Modality effect meta** (Ginns 2005, k=43): strong effect under system-paced conditions (d~0.72); effect disappears or reverses under self-paced conditions.
- **Spatial contiguity meta** (Ginns 2006, k=50): integrating related text and pictures substantially improves learning. Effect stronger for complex materials.
- **Signaling meta** (Schneider et al. 2018, k=103, N=12,201): retention g+=0.53, transfer g+=0.33. Signaling also reduces cognitive load and improves motivation/affect.
- **Redundancy meta** (Adesope & Nesbit 2011, k=57): spoken-written > spoken-only for low prior knowledge, system-paced, picture-free materials. For high prior knowledge or self-paced, redundancy can hurt.

### Boundary Conditions
- **Self-paced reversal**: The modality effect (audio+graphics > text+graphics) reverses in self-paced environments — learners can re-read text, so audio adds no benefit and may add redundancy. MCG is self-paced → default to text+image, not narration+image.
- **Prior knowledge**: All multimedia principles are stronger for low-prior-knowledge learners. For professional audiences (17+ professional), principles still apply but the ceiling is lower — good design is table stakes, not a differentiator.
- **Complexity**: Principles matter more for high-element-interactivity content (complex systems, abstract concepts) than for simple definitions or lists.

### Anti-Patterns
- **Decorative images**: Adding images that don't illustrate the concept (stock photos, generic icons). Every image must carry instructional weight.
- **Split attention**: Image on one screen, explanation text below the fold. Always integrate text and image in the same viewport.
- **Full transcript as caption**: On-screen text that is an exact duplicate of the voiceover. For self-paced text-based courses, this means: don't put the same information in the image AND the image caption. Caption = annotation, not repetition.
- **Ignoring coherence**: Including "fun facts" and tangential stories that don't serve the learning objective.

### Prompt Coverage
- `<PEDAGOGY> <MULTIMEDIA_PRINCIPLES>` — all 11 principles as checklist
- `<LESSON_TEMPLATE> IMAGE_BLOCK` — required slot for spatial/structural concepts
- `<FAILURE_CONDITIONS> IMAGE_AUDIT_BEFORE_SUBMIT` — images required for spatial concepts
- `<POST_GENERATION_REVIEW> 8_VISUALS`

### Priority: High

### Key Sources
- Noetel et al. (2021) — Review of Educational Research (meta-meta, 29 reviews)
- Ginns (2005) — Learning and Instruction (modality meta, k=43)
- Schneider et al. (2018) — Educational Research Review (signaling meta, k=103)
- Adesope & Nesbit (2011) — Journal of Educational Psychology (redundancy meta, k=57)

---

## 7. Cognitive Load Theory

### Key Findings
- **Foundational theory** (Sweller, van Merriënboer & Paas 2019, 20-year retrospective): CLT is based on human cognitive architecture (limited working memory, unlimited long-term memory). 15+ specific cognitive load effects have been demonstrated from randomized controlled trials.
- Microlearning + CLT: bite-sized reduces extraneous load, moderate intrinsic load, higher germane load (Lopez 2024, N=300). Mean microlearning effectiveness 4.25/5.
- Microlearning vs macro-learning meta: +12.6 points post-test difference (p=0.03) favoring microlearning (Senandheera et al. 2024).
- Segmentation: high segmentation significantly ↓ cognitive load, ↑ vocabulary, comprehension, retention (2024 meta, BMC Psychology).
- Cueing meta (2017, k=32, N=3,597): cues significantly reduce total cognitive load (g=0.47) and improve retention and transfer.

### Boundary Conditions
- **Expertise reversal**: Worked examples help novices but harm experts (they already have schemas and find examples redundant). For professional audiences, skip worked examples; use case studies instead.
- **Element interactivity**: CLT effects are strongest for high-element-interactivity materials (complex systems, multi-step processes). For simple knowledge/awareness content, the effects are present but smaller — don't over-chunk.
- **Self-paced vs. system-paced**: In self-paced environments like MCG, extraneous load from poor design is still harmful, but learners can compensate by re-reading. This doesn't excuse bad design, but it lowers the urgency for some CLT guidelines.

### Anti-Patterns
- **Over-segmentation**: A 3-step process split into 5 lessons. Learners lose the connecting thread. Follow the one-concept-per-lesson rule, but group tightly related concepts.
- **Split-attention**: Image on one page, its explanation on the next lesson. Always co-locate.
- **Redundant explanations**: The same concept explained in text, then again in an image, then again in a callout box. Choose one primary explanation and reinforce, don't repeat.
- **Insufficient pretraining**: Using domain-specific terms without defining them first. Every lesson with new terminology must start with pretraining.

### Prompt Coverage
- `<PEDAGOGY> <MICROLEARNING_CHUNKING>` — one concept per lesson, scaffolding
- `<MODEL_BEHAVIOUR_CONSTRAINTS> PARAGRAPH_MAX_WORDS, ALWAYS_CHECK_COGNITIVE_LOAD`
- `<TEXT_CHUNKING> (canonical)` — short paragraphs, bullet lists
- `<PEDAGOGY> <MULTIMEDIA_PRINCIPLES> COHERENCE, SEGMENTING`

### Priority: High (as foundation for other principles)

### Key Sources
- Sweller, van Merriënboer & Paas (2019) — Educational Psychology Review (20-year retrospective)
- Sweller (2020) — Educational Technology & Society (CLT + ed tech)
- Lopez (2024) — European Journal of Education (CLT + microlearning)
- Cueing meta (2017) — PLOS One (k=32, N=3,597)

---

## 8. Feedback Quality

### Key Findings
- Digitally delivered feedback meta (2024, k=116): g=0.41 overall. Process-focused feedback, assessment type, learner control are moderators. Any feedback > no feedback.
- Network meta (2022, k=77, 163 effects): **Elaborated Feedback (EF)** most effective for BOTH lower-order (recall/recognition) AND higher-order (transfer) learning outcomes.
- Answer-Until-Correct with explanation (AUCE) strongest single feedback variant.
- EF with explanation (EFE) is the **only type effective for LOW prior knowledge** students.
- AI personalized feedback meta (2025, k=40, N=5,849): g=0.58 (learning outcomes), g=0.82 (motivation). Moderators: learner level, experimental period, type of feedback.

### Boundary Conditions
- **Prior knowledge reversal**: All feedback types work for high-prior-knowledge learners. Only EFE (elaborated explanation) works for low-prior-knowledge learners. AI personalized feedback has strongest effect on mid-level learners.
- **Quiz format constraint**: MCG quizzes are single-question, single-correct-answer. AUCE (re-attempt until correct) is not natively supported — the workaround is the `outro` field for elaborated feedback.
- **Process vs. person**: Process-focused praise builds growth mindset for struggling learners. For consistently high-performing learners, process feedback is still beneficial but the effect is smaller — they already attribute success to effort.

### Anti-Patterns
- **Empty feedback**: "Correct!" or "Incorrect" with no elaboration. Every quiz answer needs a why.
- **Person praise**: "You're so smart!" / "Great job!" without specifics. Use process praise: "Nice — you ruled out B because it confuses cause and correlation."
- **Over-explaining for experts**: Giving a full step-by-step explanation to a professional who made a simple slip. Match depth to audience.
- **Single feedback pattern**: Every quiz using the same "Correct! The answer is X because..." template. Vary the elaboration style: "This works because...", "A common mistake is...", "Think of it like...".

### Prompt Coverage
- `<PEDAGOGY> <FEEDBACK_QUALITY>` — process-focused language, depth by prior knowledge
- `<QUIZ_RULES> CHOICES_IMMUTABLE_AFTER_CREATE, OPTIONS_MIN/MAX`
- `<ASSESSMENT_BLUEPRINT> FEEDBACK_RULE` — elaborated feedback on every quiz
- `<POST_GENERATION_REVIEW> 6_QUIZ_QUALITY`

### Priority: High

### Key Sources
- Fyfe et al. (2024) — Learning Environments Research (k=116)
- Fyfe et al. (2022) — Journal of Educational Psychology (network meta, k=77)
- Wang et al. (2025) — AI personalized feedback meta (k=40)

---

## 9. Self-Explanation & Metacognition

### Key Findings
- Self-explanation prompts meta (Bisra et al. 2018, k=68): g=0.55 overall.
- Best formats: fill-in-the-blank g=0.90, predirected g=0.70, interrogative g=0.56, multiple-choice g=0.24 (weakest).
- "Conceptualize" type most effective g=0.87; "Justify" g=0.42; "Explain" g=0.68.
- Metacognitive prompts meta (Guo 2022): g=0.50 for SRL activities, g=0.40 for learning outcomes. Task-specific + adaptive + feedback most effective.
- Self-explanation vs. instructional explanation: self-explanation g=0.67, instructional explanation g=0.35 (Bisra et al.).

### Boundary Conditions
- **Age 5-7**: Fill-in-the-blank and predirected are most appropriate. Open-ended "explain in your own words" places too much demand on working memory and expressive language.
- **Knowledge vs. skill**: Self-explanation is more effective for conceptual knowledge than procedural skills. For procedures, worked examples + practice > self-explanation.
- **Prompt fatigue**: 10 self-explanation prompts in one module → learners start writing minimal answers. Limit to 1-2 per section, placed after high-value concepts.

### Anti-Patterns
- **Lowest-ranked format**: Using multiple-choice self-explanation prompts (g=0.24) when fill-in-the-blank (g=0.90) is just as easy to write.
- **Vague prompts**: "What did you learn?" without scaffolding. Use specific prompts: "Complete the sentence: This concept matters because ___."
- **No modeling**: Dropping self-explanation prompts without first showing what a good explanation looks like. The first occurrence should include an example.
- **Ignoring the answer**: Self-explanation prompts in the lesson body have no answer key — they're reflection, not assessment. Don't mark them right/wrong.

### Prompt Coverage
- `<PEDAGOGY> <SELF_EXPLANATION_PROMPTS>` — 4 ranked formats, age gating
- `<LESSON_TEMPLATE> SELF_EXPLANATION_PROMPT` — required slot
- `<POST_GENERATION_REVIEW> 13_SELF_EXPLANATION`

### Priority: High

### Key Sources
- Bisra et al. (2018) — Educational Psychology Review (k=68)
- Guo (2022) — Journal of Computer Assisted Learning (metacognitive prompts)
- Rittle-Johnson et al. (2017) — ZDM Mathematics Education

---

## 10. Retrieval Practice & Spacing

### Key Findings
- Practice testing vs. restudy: g=0.50, 81% of comparisons favor testing (Rowland 2014, k=159).
- Visible Learning: practice testing d=0.49 (902 effects, 222,708 students).
- Spacing effect meta (Murray et al. 2025): g=0.28 overall; isolated learning g=0.43, course-embedded g=0.24.
- Spacing in 9 STEM courses (Bego et al. 2024): mean improvement 1.50% (not significant after heterogeneity). But spacing imposed desirable difficulty (lower practice performance, higher long-term retention).
- Covert retrieval (thinking without writing) vs. overt retrieval (Yu et al. 2025): both effective; overt slightly stronger.

### Boundary Conditions
- **Course-embedded vs. isolated**: Spacing effects are stronger in isolated training sessions (g=0.43) than embedded in courses (g=0.24). Within self-paced MCG courses, the spacing benefit is real but modest — pair it with desirable difficulty framing to maximize learner buy-in.
- **STEM vs. humanities**: Spacing effects are more consistently found in STEM content. For humanities/ethics/awareness courses, retrieval practice still works but the spacing interval matters less — interleaving concepts from earlier modules is the primary benefit.
- **Age 5-7**: Spacing should be within-module only (review yesterday's material), not across-module. Cross-module retrieval requires more mature metacognition.

### Anti-Patterns
- **Testing without feedback**: A retrieval quiz that says "correct/incorrect" and moves on. Every retrieval attempt needs elaboration — this is where retrieval + feedback combine for maximum effect.
- **Massed retrieval**: All review questions from the most recent section, none from earlier material. True spacing reaches back at least 1-2 sections.
- **Undesirable difficulty**: Questions so hard they frustrate rather than challenge. Keep retrieval difficulty moderate — learners should struggle but succeed.
- **No framing**: Quizzes presented as "tests" rather than "practice for your brain." Use desirable difficulty framing: "This may feel harder — that's your brain building stronger connections."

### Prompt Coverage
- `<PEDAGOGY> <RETRIEVAL_PRACTICE_AND_SPACING>` — spaced retrieval, desirable difficulty, covert/overt
- `<ASSESSMENT_BLUEPRINT> SPACING_RULE` — each quiz ≥1 question from prior sections
- `<POST_GENERATION_REVIEW> 16_SPACED_RETRIEVAL`

### Priority: High

### Key Sources
- Rowland (2014) — Psychological Bulletin (k=159)
- Yang et al. (2021) — Psychological Bulletin (classroom testing)
- Murray et al. (2025) — Educational Psychology Review (spacing + math)
- Bego et al. (2024) — IJ STEM Education (spacing in 9 STEM courses)

---

## 11. Interleaving & Desirable Difficulties

### Key Findings
- Interleaved learning meta (Brunmair & Richter 2019, k=59, 238 effects): g=0.42 overall.
- Best for: paintings/visual materials g=0.67, mathematical tasks g=0.34.
- **NEGATIVE effect for words/expository text**: g=-0.39 (blocking better for verbal content).
- Interleaving → better for high between-category similarity + high within-category similarity.
- Desirable difficulties (Bjork & Bjork): spacing, interleaving, varied practice reduce performance during learning but enhance long-term retention and transfer.
- Learners and instructors systematically underestimate the value of interleaving/spacing (meta-awareness gap).

### Boundary Conditions
- **Content type is the primary gate**: Interleaving helps visual/pattern-recognition (g=0.67) and math (g=0.34). It HURTS verbal/expository (g=-0.39). The decision is not by course type — it's by section content within a course.
- **Age gate**: Ages 5-11 should never experience interleaving. Their developing categorization schemas benefit from blocked practice that establishes clear boundaries before mixing categories.
- **Desirable difficulty ceiling**: When initial retrieval success drops below 50%, difficulty stops being desirable and becomes demotivating. Monitor the balance.

### Anti-Patterns
- **Interleaving everything**: Applying interleaving to vocabulary, definitions, or narrative text because it "sounds like a good teaching strategy." This actively harms learning.
- **Interleaving without signaling**: Mixing categories without telling the learner they'll see different types. A brief header ("Now try a different kind of problem") helps metacognition.
- **Silent difficulty**: Imposing interleaving/spacing without explaining why it feels harder. Always include learner-facing framing: "This mix of topics is intentional — it builds stronger memory connections."

### Prompt Coverage
- `<PEDAGOGY> <INTERLEAVING>` — conditional section with INTERLEAVE_WHEN / BLOCK_WHEN / AGE_GATE
- `<PEDAGOGY> <RETRIEVAL_PRACTICE_AND_SPACING> DESIRABLE_DIFFICULTY_FRAMING` — learner-facing note

### Priority: Conditional (interleaving) / Medium (desirable difficulty framing)

### Key Sources
- Brunmair & Richter (2019) — Psychological Bulletin (interleaving meta, k=59)
- Bjork & Bjork (2011) — desirable difficulties framework
- Firth et al. (2021) — Review of Education (interleaving systematic review)

---

## 12. Assessment Quality & Constructive Alignment

### Key Findings
- **Constructive alignment** (Biggs 1996, 2003): When intended learning outcomes, teaching activities, and assessment tasks are explicitly aligned, students adopt deep approaches to learning. The framework requires outcome verbs to match assessment format — "explain" assessed via written explanation, not MCQ recall. Biggs & Tang (2022, 5th ed., ~32k citations) is the standard reference. No direct meta-analysis of CA exists as a packaged intervention, but the component effects are well-documented.
- **Formative assessment meta-analyses**: Black & Wiliam (1998, 250+ studies, 20k+ citations) reported ES range 0.4–0.7, though later re-analyses found inflated estimates. Kingston & Nash (2011, k=13, 42 ES): median ES=0.25, weighted mean=0.20. Yao et al. (2024, k=118 studies, 258 ES): g=0.25 overall. Sortwell et al. (2024, systematic review of 9 meta-analyses): consistent range 0.20–0.40.
- **Feedback effects**: Hattie (2017, 1,200+ meta-analyses): feedback d=0.70, formative evaluation d=0.48, teacher clarity d=0.75. These are among the highest influences on achievement when assessment is well-designed.
- **MCQ item quality**: Rodriguez (2005, meta-analysis covering 80 years): three-option MCQs are optimal — more options increase distractor dysfunction without improving psychometric quality. Hye et al. (2025, k=24): faculty training and peer review significantly reduce item-writing flaws.
- **Distractor quality**: Plausible distractors discriminate between learners who know the material and those who partially understand. Implausible distractors ("which of these is NOT a planet: Mars, Cheese, Venus") add noise not signal. Every distractor should reflect a common misconception or near-miss (Butler 2018, Roediger & Karpicke 2006).
- **Stem clarity**: Negatively-worded stems ("Which of the following is NOT...") increase reading load without measuring deeper understanding. They disproportionately harm lower-performing students and English language learners (Frey et al. 2005, Rodriguez 2005). Avoid where possible; if used, flag the negation with typographic emphasis (e.g., **NOT**).
- **Recall vs. transfer discrimination**: MCQs can assess recall (fact retrieval), comprehension (paraphrase/example recognition), and application (scenario-based). Haladyna et al. (2002, k=91 studies, 143 effects): scenario-based MCQs with novel contexts are the strongest predictors of transfer ability. Every module should include at least one scenario-based quiz item to assess beyond recall.
- **Opportunity-to-learn / alignment**: Scheerens (2016, 2017): curriculum alignment effect d≈0.30. Misalignment between taught and tested content systematically depresses achievement (Bull 2025, PRISMA-guided synthesis).
- **Assessment of higher-order thinking**: Gijbels et al. (2005, 1,667 citations): assessment alignment moderated PBL effectiveness — poorly aligned assessments underestimated PBL's impact. Walker & Leary (2009, k=82 studies, 201 outcomes): same pattern.

### Boundary Conditions
- **Constructive alignment is design-level, not lesson-level**: It operates at the course/module blueprint stage, not within individual lesson content. MCG's landing page outcomes should drive assessment design — quiz items need explicit mapping back to stated outcomes.
- **Formative assessment ceiling**: Effects are larger for lower-performing students and in contexts with infrequent prior assessment. For courses with regular quiz placement (as MCG requires), marginal gains from additional formative assessment are smaller — focus on quality, not frequency.
- **MCQ limits for higher-order outcomes**: MCQs can assess recall, comprehension, and some application, but they cannot assess creation, design, or authentic performance. When the course outcome involves producing a real artifact, the assessment must include that production, not just recognition.
- **Item-writing training matters**: Poorly written MCQs (ambiguous stems, implausible distractors, "all of the above") produce unreliable scores regardless of alignment. The added item-writing rules (plausible distractors, one correct, 3–4 options) address this — verify compliance via lesson_selections.

### Anti-Patterns
- **Alignment theater**: Stating "By the end, learners will be able to analyze X" but then assessing only recall of X's definitions. The outcome verb must match the assessment verb.
- **Over-assessment**: Adding a quiz after every lesson regardless of content density. The QUIZ_QUANTITY_RULES (divisors by age/type) already prevent this.
- **Distractor dysfunction**: Including obviously wrong or humorous options that don't test discrimination between correct understanding and common error. Every distractor should be a plausible misconception.
- **Ignoring constructive alignment in landing pages**: Writing a landing page with grand outcomes ("design, build, deploy") but generating only knowledge-level lessons. The outcomes must be achievable within the course's actual content.

### Prompt Coverage
- `<ASSESSMENT_BLUEPRINT>` — formative quiz, mastery quiz, SCORM interaction types
- `<QUIZ_RULES>` — MCQ format, options 3–4, one correct, elaborated feedback
- `<QUIZ_QUANTITY_RULES>` — proportional quiz placement by age/course-type
- `<SECTION_RULES> QUIZ_REQUIRED` — minimum 1 per module
- `<POST_GENERATION_REVIEW> 6_QUIZ_QUALITY` — quiz structural checks
- `<POST_GENERATION_REVIEW> 1_TRANSFORMATION, 2_OUTCOMES` — outcome–assessment alignment check
- `<FAILURE_CONDITIONS> INSUFFICIENT_QUIZ_QUANTITY, MULTIPLE_CORRECT_ANSWERS`
- `<FAILURE_CONDITIONS> WITTY_DISTRACTOR_TOO_WEAK`
- `<POST_GENERATION_REVIEW> 24_ALIGNMENT` — outcome–assessment verb matching check
- `<POST_GENERATION_REVIEW> 28_FEEDBACK_DEPTH` — elaborated feedback depth check
- `<ERROR_CORRECTION_LOOP> VALIDATE_ALIGNMENT` — quiz verb vs outcome verb verification
- `<ERROR_CORRECTION_LOOP> VALIDATE_FEEDBACK_DEPTH` — feedback elaboration check
- `<FAILURE_MODE_PREVENTION> ALIGNMENT_THRESHOLD` — >30% mismatch triggers revision
- `<FAILURE_MODE_PREVENTION> FADING_TRACKER` — WE progression compliance

### Priority: High

### Key Sources
- Biggs, J., & Tang, C. (2022) — Teaching for Quality Learning at University (5th ed.)
- Hattie, J. (2017) — Visible Learning: 250+ Influences on Achievement
- Black & Wiliam (1998) — Assessment in Education (k=250+ studies)
- Kingston & Nash (2011) — Formative assessment meta (k=13, 42 ES)
- Yao et al. (2024) — Formative assessment K-12 meta (k=118, 258 ES, g=0.25)
- Rodriguez (2005) — MCQ optimal options meta (80 years)
- Scheerens (2016) — Opportunity-to-learn alignment (d≈0.30)
- Sortwell et al. (2024) — 9 meta-analyses on formative assessment (0.20–0.40)

---

## 13. Self-Regulated Learning

### Key Findings
- **SRL training overall effect**: Sitzmann & Ely (2011, k=200+ studies, work-related training): r=0.34 (d≈0.72) for achievement, r=0.43 (d≈0.95) for self-efficacy. Dignath & Büttner (2008, k=84, 357 ES): overall d=0.69 for K-12 SRL interventions. Theobald (2021, university SRL training): g=0.50–0.60 for academic performance, g=0.45 for SRL strategies.
- **Zimmerman's cyclical model** (forethought → performance → self-reflection): Three-phase training outperforms two-phase, which outperforms single-phase (Cleary et al. 2006, linear trend). Forethought phase: goal-setting d=0.77 (Zimmerman & Kitsantas 1997). Self-reflection: d=0.52 for at-risk college students (Zimmerman et al. 2011).
- **Metacognitive prompts**: Guo (2022, k=computer-based learning): g=0.50 for SRL activities, g=0.40 for learning outcomes. Zheng (2016): d=0.44 for SRL scaffolds. Prompts are most effective when task-specific, adaptive, and paired with feedback.
- **Goal-setting effects**: Sitzmann & Ely (2011): goal-setting r=0.34 (d≈0.72). Harkin et al. (2016, k=138): goal progress monitoring d=0.40. Process goals > outcome goals for skill acquisition (Zimmerman & Kitsantas, d=0.68–0.77).
- **Self-monitoring / self-assessment**: Dignath et al. (2023, k=32, N=3,492, 109 ES): monitoring tools d=0.42 for achievement; highest when tools focus on both learning content AND behavior. Yan et al. (2021): self-assessment in higher ed g=0.45 overall; with feedback g=0.66, without g=0.21.
- **Calibration accuracy**: Gutierrez de Blume (2022): strategy instruction improves monitoring accuracy g=0.56. Janssen & Lazonder (2024): confidence judgments more malleable than judgments of learning g=0.38. Poor performers are most likely to overestimate (Brown & Harris 2013, range d=-0.04 to 1.62).
- **SRL in online/blended environments**: Xu et al. (2023, k=214): g=0.44 overall. Dent & Koenka (2016, k=149, N=58,759): SRL–achievement correlation r=0.34. Self-paced environments particularly benefit from embedded goal-setting and progress monitoring.

### Boundary Conditions
- **Age differentiation**: SRL effects are stronger for older students (Dent & Koenka 2016). Ages 5-7: metacognitive prompts can overwhelm working memory — use concrete progress indicators, not abstract goal-setting. Ages 8-11: simple self-check prompts ("Did I include all three parts?"). Ages 12+: full SRL cycle (predict → monitor → reflect).
- **Self-paced ceiling**: In self-paced courses, learners can choose to skip SRL prompts. Embed them as required checkpoints (e.g., "Before moving on, rate your confidence") rather than optional reflections.
- **Domain specificity**: SRL strategies transfer poorly across domains. A goal-setting prompt in a Bible course should reference Bible-specific outcomes, not generic "do your best" framing.
- **Prompt fatigue**: More than one metacognitive prompt per section leads to superficial responses. The existing one-per-section rule (SELF_EXPLANATION_REQUIRED) is the right ceiling.
- **Calibration requires feedback**: Simply asking learners to rate confidence without revealing actual accuracy does not improve calibration. Every confidence prompt must be followed by the correct answer disclosure.

### Anti-Patterns
- **Empty reflection**: "What did you learn?" without specific framing. Use structured prompts: "Complete the sentence: The most important thing about X is ___ because ___."
- **No follow-through**: Asking learners to set goals but never returning to them. If a goal-setting prompt appears in Section 1, Section 3's reflection should reference it: "Remember your goal from the start? Are you closer to it?"
- **Ignoring calibration**: Quizzes without confidence ratings miss the chance to diagnose overconfidence. Even one "How sure are you?" prompt per module improves metacognitive awareness.
- **Rubric without instruction**: Providing a "Check Your Work" list without modeling how to use it. First occurrence should include a demonstration.

### Prompt Coverage
- `<SELF_EXPLANATION>` — prompts required, format ranking, age gating
- `<SECTION_RULES> REFLECTION_REQUIRED` — end-of-section metacognitive prompt
- `<LEARNING_ARC> ARC_STEPS` — includes reflection step 7
- `<SDT_ENGAGEMENT> COMPETENCE_SCAFFOLDING` — progressive difficulty
- `<POST_GENERATION_REVIEW> 13_SELF_EXPLANATION` — prompt presence check
- `<LESSON_TEMPLATE> SRL_PROMPT` — confidence rating, goal-check, or calibration prompt
- `<COURSE_TYPE_MATRIX> SRL_PHASE: required` — skill courses: goal-setting (Sec 1), confidence (mid), calibration (end)
- `<COURSE_TYPE_MATRIX> SRL_PHASE: recommended` — decision courses
- `<SECTION_RULES> SRL_REQUIRED` — per COURSE_TYPE_MATRIX, with age gates
- `<POST_GENERATION_REVIEW> 25_SELF_REGULATED_LEARNING` — SRL presence check
- `<FAILURE_CONDITIONS> MISSING_SRL_PROMPTS`

### Priority: High

### Key Sources
- Sitzmann & Ely (2011) — SRL in work training meta (k=200+, r=0.34)
- Dignath & Büttner (2008) — K-12 SRL meta (k=84, 357 ES, d=0.69)
- Theobald (2021) — University SRL meta (g=0.50–0.60)
- Guo (2022) — Metacognitive prompts in CBLEs (g=0.50)
- Dignath et al. (2023) — Monitoring tools meta (k=32, N=3,492, d=0.42)
- Xu et al. (2023) — SRL in online/blended (k=214, g=0.44)
- Zimmerman & Kitsantas (1997, 1999) — Goal-setting experiments (d=0.68–0.77)
- Harkin et al. (2016) — Goal progress monitoring (k=138, d=0.40)
- Dent & Koenka (2016) — SRL–achievement correlation (k=149, N=58,759, r=0.34)
- Panadero (2017) — SRL models review (6 models compared)

---

## 14. Worked Examples & Faded Guidance

### Key Findings
- **Worked-example effect**: Sweller & Cooper (1985, original study, N=30–40): students studying worked example-problem pairs outperformed conventional problem-solving by ~0.5–0.8 SD. Barbieri et al. (2023, k=43 articles, 55 studies, 181 ES, N≈7,500): **first comprehensive meta-analysis** — overall g=0.48. Correct examples alone > incorrect or mixed examples. Worked examples remain one of the strongest and most replicable effects in instructional design (Sweller, van Merriënboer & Paas 2019, 20-year CLT retrospective).
- **Faded guidance / completion effect**: Atkinson, Renkl & Merrill (2003, N=148): fading alone d=0.46; fading + self-explanation prompts d=0.82. Renkl, Atkinson & Große (2004): gradual fading outperformed full examples and full problem-solving on near and far transfer (d=0.54–0.76). Forward fading (removing later steps first) > backward fading. Recommended sequence: 4–6 faded examples before independent practice (Renkl 2014).
- **Expertise reversal effect**: Kalyuga, Ayres, Chandler & Sweller (2003, narrative review): For novices, worked examples > problem-solving (d=0.40–1.10). For experts, problem-solving > worked examples (d=-0.30 to -0.70). Kalyuga et al. (2001, N=60): low-knowledge d=1.08, high-knowledge d=-0.64. The cross-over interaction is robust — guidance must be faded as expertise grows.
- **Example variability**: Paas & Van Merriënboer (1994, N=80): high-variability examples improved transfer d=0.80. Quilici & Mayer (1996, N=143): varied surface features with same structural features improved categorization by ~20–30% (η²=.12–.18, ~d=0.55–0.75). Renkl, Stark, Gruber & Mandl (1998, N=36): variability + self-explanation d=0.71 on transfer.
- **Variability principle**: Multiple examples with different surface features but identical underlying structure produce far transfer (generalization to new contexts). Same-surface examples produce near transfer only. For skill courses, each WORKED_EXAMPLE set should vary surface features (context, names, numbers, visual layout) while preserving the procedural structure. Minimum 2 surface variations per 3-example set (Renkl 2014).
- **Self-explanation on worked examples**: Rittle-Johnson, Loehr & Durkin (2017, k=36): g=0.38 for procedural knowledge, g=0.55 for conceptual knowledge. However, Barbieri et al. (2023) found self-explanation prompts unexpectedly reduced effect in their meta (negative moderator) — suggesting poorly designed prompts distract. Structured, principle-based prompts succeed; open-ended "explain why" fails (Wittwer & Renkl 2010, k=15, d=0.40 for principle-based explanations).
- **Example-problem pairs vs. problem-example pairs**: Van Gog, Kester & Paas (2011, N=68): example-problem pairs d=0.67; problem-example pairs d=0.38 (ns). Example-first is superior. Schwonke et al. (2009, two studies): worked examples outperformed even tutored problem-solving in well-designed Cognitive Tutors (d=0.39–0.67).

### Boundary Conditions
- **Expertise reversal is non-negotiable**: The same learner who benefits from worked examples at the start of a module may be harmed by them by the end. Fading must track learner progress, not follow a fixed schedule. Adaptive fading (Salden et al. 2010, d=0.33) outperforms fixed fading.
- **Self-explanation design is critical**: Structured prompts ("Which principle does this step apply?") work; open-ended ("Explain what happened") do not. Barbieri (2023) found SE prompts reduced WE effects overall — likely because many studies used weak prompts.
- **Content type matters**: Worked examples are most effective for procedural skills (math, science, problem-solving). For declarative knowledge (history facts, terminology), the effect is smaller. SKIP for purely conceptual/awareness content where schema acquisition is not the primary goal.
- **Age 5-7**: Worked examples should be concrete and visual. Abstract notation-based examples (algebra, code) are inappropriate. Use picture-based step sequences instead.
- **Course type filter**: The worked-example effect is strongest in skill-building and decision-making courses. For knowledge/awareness courses (CLT type: light), the effect is present but smaller — prioritize concise explanations over example sequences.

### Anti-Patterns
- **Example overload**: Presenting 10+ worked examples without requiring active processing. Learners stop engaging. Limit to 3–5 well-designed examples with self-explanation prompts.
- **Abrupt fading**: Going from full worked examples straight to independent problem-solving with no intermediate steps. Always use completion problems (partially filled examples) as bridges.
- **Ignoring expertise**: Using the same example set for a learner who already knows the content. Pre-test or use adaptive fading based on performance.
- **Incorrect examples without correction**: Showing faulty examples without explicit annotation of what went wrong. Incorrect examples alone (without correction) confuse novices (Barbieri 2023).
- **Same-surface examples**: All examples using identical surface features — learners cannot transfer to new contexts. Vary surface details while preserving structure.

### Prompt Coverage
- `<COURSE_TYPE_MATRIX>` — skill and decision-making templates include practice/activity slots
- `<SECTION_TEMPLATE> full` — Info → Quiz → Mistake → Your Turn → Activity → Recap (implicit WE slot)
- `<YOUR_TURN_RULES>` — task-to-block mapping for application
- `<MULTIMEDIA_PRINCIPLES>` — CLT-based design (segmenting, pretraining)
- Note: There is NO explicit worked-example or fading sequence in any template. The "full" section template could include a dedicated WE→completion→independent practice progression for skill courses. Consider adding a `WORKED_EXAMPLE_SLOT` to the LESSON_TEMPLATE and a `FADING_STEPS` parameter to phased practice lessons.

### Priority: High

### Key Sources
- Barbieri et al. (2023) — WE meta (k=43, 55 studies, 181 ES, g=0.48)
- Atkinson, Renkl & Merrill (2003) — Fading + self-explanation (N=148, d=0.46–0.82)
- Kalyuga et al. (2003) — Expertise reversal review (d=0.40–1.10 / -0.30 to -0.70)
- Paas & Van Merriënboer (1994) — Example variability (N=80, d=0.80)
- Renkl (2014) — Faded guidance synthesis (recommended 4–6 examples)
- Van Gog et al. (2011) — Example-problem vs. problem-example (N=68, d=0.67)
- Rittle-Johnson et al. (2017) — Self-explanation meta (k=36, g=0.38–0.55)
- Salden et al. (2010) — Adaptive vs. fixed fading (d=0.33)
- Sweller, van Merriënboer & Paas (2019) — CLT 20-year retrospective

---

## 15. Cognitive Apprenticeship

### Key Findings
- **Six teaching methods** (Collins, Brown & Newman 1989, 11k+ citations): **Modeling** — expert demonstrates with think-aloud; **Coaching** — observation with targeted feedback; **Scaffolding** — supports with gradual fading; **Articulation** — learner verbalizes reasoning; **Reflection** — comparing own process to expert/peers; **Exploration** — independent problem-framing and solving. These map to a progression: expert-controlled (modeling, coaching, scaffolding) → learner-controlled (articulation, reflection, exploration).
- **Situated cognition foundation** (Brown, Collins & Duguid 1989, 27k+ citations): Knowledge is situated in authentic activity. Decontextualized instruction produces inert knowledge. CA makes expert cognitive processes visible — the key difference from traditional apprenticeship is making tacit expertise overt.
- **Scaffolding effectiveness**: Belland, Walker, Kim & Lefler (2017, Bayesian network meta-analysis, cited by 591): computer-based scaffolding in STEM g=0.44–0.57 across outcome levels. Doo, Bonk & Heo (2020, k=18 studies, 64 ES): scaffolding in online higher education g=0.71 overall. Fading (graduated support removal) significantly increases effectiveness over static scaffolding (Belland et al. 2017 moderator analysis).
- **Scaffolding by outcome type**: Belland et al. (2015, g=0.53 overall for computer-based scaffolding in STEM). Effects are stronger for concept learning than principle learning, and for application-level outcomes than recall — consistent with CA's focus on transferable knowledge.
- **Modeling in digital environments**: Fendt et al. (2023, N≈150): CA with human modeling outperformed text-only instructions for lateral reading against misinformation. Saadati et al. (2015, N=60): Internet-Based CA Model (i-CAM) for postgraduate statistics produced large effect (η²=0.23).
- **CA for academic skills**: De La Paz et al. (2024, N≈80): CA + self-regulated strategy development for argumentative writing — near-transfer d=1.08, far-transfer d=0.76. Alwafi (2023, N=78): online CA environment improved critical thinking and CSCL interaction.
- **Articulation–reflection loop** is the most underutilized CA method in e-learning (Matsuo & Tsukube 2020, review). Many implementations model and scaffold but skip structured articulation, reducing far transfer.

### Boundary Conditions
- **Self-paced delivery constraint**: CA was designed for dyadic interaction (expert–learner). In self-paced courses, modeling must be pre-recorded (video or worked example with think-aloud). Coaching and scaffolding must be built into the content structure rather than delivered in real-time. This reduces but does not eliminate effectiveness.
- **Age appropriateness**: Full CA (all six methods) is appropriate for ages 12+ and adult learners. Ages 8-11: focus on modeling, scaffolding, and exploration (skip abstract articulation). Ages 5-7: modeling and guided exploration only — the cognitive load of articulation and reflection is too high.
- **Course type fit**: CA is highest value for skill-building, tool-use, and decision-making courses where expert thinking processes are non-obvious. Low value for pure knowledge/awareness where the goal is recall, not skill transfer.
- **Domain structure matters**: CA works best in domains with visible expert processes (writing, design, analysis, troubleshooting, medical diagnosis). For domains where expert reasoning is highly automated or intuitive (e.g., fluent reading), making it explicit can actually disrupt performance (articulation can harm automated skills).

### Anti-Patterns
- **CA in name only**: Labeling a course "cognitive apprenticeship" but only providing information + quiz (no modeling, no fading, no articulation). CA requires the full six-method arc.
- **Modeling without labeling**: Showing a worked example but not verbalizing the expert's decision process. Modeling must include explicit think-aloud, not just the final product.
- **Scaffolding without fading**: Providing extensive support throughout the entire course with no gradual removal. Learners become dependent. Every scaffold should have a planned fade point.
- **Articulation as interrogation**: Asking "Why did you do that?" in a way that feels evaluative rather than reflective. Frame as genuine curiosity: "I'm wondering what made you choose that approach."
- **Exploration without preparation**: Sending learners to explore independently without first providing models and coached practice. Exploration is the final phase, not the first act.

### Prompt Coverage
- `<COURSE_TYPE_MATRIX> skill` — references apprentice-arc narrative persona
- `<SECTION_TEMPLATE> full` — Info → Quiz → Mistake → Your Turn → Activity → Recap (implicit CA arc)
- `<APPRENTICESHIP_FRAMING>` — conditional, applies to practice-driven courses
- `<SDT_ENGAGEMENT>` — autonomy, competence, relatedness (underpins CA)
- Note: There is NO explicit CA phase in the LESSON_TEMPLATE or SECTION_TEMPLATE. The six CA methods map imperfectly onto existing slots. Consider adding a `CA_SEQUENCE` parameter to skill-type modules that overrides the default section template with a modeling→scaffolding→articulation→exploration structure.

### Priority: High (for skill courses)

### Key Sources
- Collins, A., Brown, J. S., & Newman, S. E. (1989) — CA framework (11k+ citations)
- Brown, J. S., Collins, A., & Duguid, P. (1989) — Situated cognition (27k+ citations)
- Belland, Walker, Kim & Lefler (2017) — Scaffolding in STEM meta (g=0.44–0.57)
- Doo, Bonk & Heo (2020) — Scaffolding in online HE (k=18, 64 ES, g=0.71)
- De La Paz et al. (2024) — CA for writing (d=1.08 near, 0.76 far)
- Matsuo & Tsukube (2020) — CA review in educational research
- Fendt et al. (2023) — CA modeling vs. text-only (N≈150)
- Saadati et al. (2015) — i-CAM for statistics (η²=0.23)
- Alwafi (2023) — Online CA for critical thinking (N=78)

---

## 16. Overall Priority Matrix

| Section | Priority | Effect Size Range | Implementation Cost | Prompt Section | Anti-Pattern Risk |
|---------|:--------:|:---:|:---:|:---:|:---:|
| SDT Engagement | **High** | r=.13–.21 | Low (choice, framing, tone) | `<SDT_ENGAGEMENT>` | False choice, over-choice |
| Multimedia Principles | **High** | d=0.36–1.67 | Low (writing guidelines) | `<MULTIMEDIA_PRINCIPLES>` | Decorative images, split attention |
| Feedback Quality | **High** | g=0.41–0.82 | Low (quiz template changes) | `<FEEDBACK_QUALITY>` | Empty feedback, person praise |
| Self-Explanation | **High** | g=0.55–0.90 | Very low | `<SELF_EXPLANATION_PROMPTS>` | Vague prompts, lowest format |
| Retrieval Practice | **High** | g=0.49–0.50 | Very low | `<RETRIEVAL_PRACTICE_AND_SPACING>` | No feedback, massed retrieval |
| CLT | **High** | d=0.70–1.67 | Already covered | `<MICROLEARNING_CHUNKING>` | Over-segmentation, split-attention |
| Assessment Alignment | **High** | d=0.20–0.48 | Medium (outcome–quiz mapping) | `<ASSESSMENT_BLUEPRINT>` | Alignment theater, distractor dysfunction |
| Self-Regulated Learning | **High** | g=0.40–0.72 | Medium (SRL prompt slots) | `<SELF_EXPLANATION>` | Empty reflection, no follow-through |
| Worked Examples & Fading | **High** | g=0.48–0.82 | Medium (WE slot + fading steps) | (no dedicated section yet) | Example overload, abrupt fading |
| Cognitive Apprenticeship | **High** | g=0.44–0.71 | Higher (full CA sequence) | (no dedicated section yet) | CA in name only, scaffolding without fading |
| Social Presence | Medium | r=.20–.43 | Medium | `<SOCIAL_PRESENCE>` | Fake social, over-personalization |
| Onboarding | Medium | g=0.3–0.5 | Low | `<ONBOARDING_REQUIRED>` | Feature tour, no early win |
| Accessibility | Medium | N/A (inclusion) | Low | `<ACCESSIBILITY_UDL>` | Checklist mindset, grey palette |
| Emotional Design | Medium | d=0.22–0.39 | Low | `<EMOTIONAL_DESIGN>` | Garish colours, decorative overload |
| Desirable Difficulties | Medium | g=0.28–0.42 | Very low | `<INTERLEAVING>` framing | Undesirable difficulty |
| Interleaving | Conditional | g=0.42 / -0.39 | Low but conditional | `<INTERLEAVING>` | Interleaving verbal content |
| Interaction-First Design | **High** | d=0.47 / ~0.47 SD | Medium (template reorder, framing, interaction variety) | (see §24) | Interaction theater, info-first default |

### Prompt Coverage Overview
Each front has a dedicated `<PEDAGOGY>` subsection in `mcg_generator_prompt.md`. The structural templates (`<LESSON_TEMPLATE>`, `<LEARNING_ARC>`, `<ASSESSMENT_BLUEPRINT>`) implement the operational rules. The validation layers (`<POST_GENERATION_REVIEW>`, `<FAILURE_MODE_PREVENTION>`, `<ERROR_CORRECTION_LOOP>`) enforce compliance.

### Recommended Drafting Order
1. **SDT_ENGAGEMENT** — foundational; frames all other engagement decisions
2. **FEEDBACK_QUALITY** — upgrade existing quiz rules; quick win
3. **SELF_EXPLANATION** — low cost, high effect, no structural changes needed
4. **MULTIMEDIA_PRINCIPLES** — comprehensive checklist for content lessons
5. **RETRIEVAL_PRACTICE** — strengthens existing quiz placement with spacing
6. **ASSESSMENT_ALIGNMENT** — outcome–quiz verification; closes quality loop
7. **EMOTIONAL_DESIGN** — age-gated visual guidelines
8. **SOCIAL_PRESENCE** — tone, prompts, persona
9. **ONBOARDING** — first-lesson template
10. **ACCESSIBILITY** — format/inclusion rules
11. **INTERLEAVING** — conditional section with clear boundaries
12. **SELF_REGULATED_LEARNING** — SRL prompts, goal-setting, calibration
13. **WORKED_EXAMPLES** — WE slot + fading progression for skill courses
14. **COGNITIVE_APPRENTICESHIP** — full CA sequence for skill/decision courses

---

## 17. Cross-Front Conflict Resolution Rules

When principles from different research fronts conflict, use these rules to disambiguate. Listed by the most common MCG decision points.

| Conflict | Resolution | Basis |
|---|---|---|
| Interleaving vs CLT segmentation | Block practice wins for verbal/expository content (g=-0.39). Interleave only for visual/pattern-recognition or math content within a section | Brunmair & Richter 2019; Sweller 2019 |
| SDT autonomy vs worked examples | Worked examples win for novices (g=0.48); autonomy wins for experts or high-prior-knowledge learners (expertise reversal, d=-0.30 to -0.70) | Barbieri 2023; Kalyuga 2003 |
| UDL multiple representation vs redundancy principle | In self-paced courses, text + image is sufficient. Do NOT add spoken narration to written text — the redundancy effect (Adesope & Nesbit 2011) outweighs UDL's representation goal | Noetel 2021; Adesope & Nesbit 2011 |
| Social presence vs professional tone | Audience age >17, especially professional → warm conversational tone is fine; buddy-framing and peer prompts are not. Keep social prompts as reflection, not interaction | Witt 2004 boundary conditions |
| Emotional design vs content sensitivity | For ethics, legal, medical, safety topics: warm palette is acceptable, but skip anthropomorphic faces and character illustrations — they can feel trivializing. Use diagrams and icons instead | Brom 2018 boundary conditions |
| SRL prompts vs cognitive load | Ages 5-7: abstract goal-setting overwhelms working memory. Use concrete progress indicators only (dots, checkmarks). Ages 8-11: limit to one self-check prompt per section | Dignath & Büttner 2008; Guo 2022 |
| Scaffolding vs learner autonomy | Plan fading schedule upfront. Do NOT scaffold content the learner already knows — expertise reversal applies at micro level within a module, not just across courses | Kalyuga 2003; Salden 2010 |
| CLT coherence vs block variety | One-concept-per-lesson rule trumps block variety within a lesson. Vary block types across lessons within a section, not within a single lesson. Max 3 block types per lesson | Sweller 2019; Noetel 2021 |
| Self-explanation vs prompt fatigue | When both self-explanation and SRL prompts are in the same section, combine them into one structured prompt rather than adding a separate metacognitive slot | Bisra 2018; Guo 2022 |
| Feedback elaboration vs efficiency | For professional/17+ audiences with high prior knowledge, use concise feedback ("Incorrect — the answer is B because X"). Reserve full elaborated explanations for low-prior-knowledge learners | Fyfe 2024 |

---

## 18. Decision Rules (If-Then)

### By Course Type

| Condition | Rule |
|---|---|
| If course type = knowledge/awareness | Use light section template (Info → Check → Recap). Skip worked examples, fading, and CA. SDT and retrieval practice are the primary engines |
| If course type = skill-building | Require worked examples + fading progression (4-6 faded examples before independent practice). Include full CA sequence (modeling → scaffolding → articulation → exploration). Require at least one Tier 2 SCORM |
| If course type = decision-making | Require scenario-engine or decision-tree SCORM (Tier 2). Include CA articulation + reflection loop. Use scenario section template (Scenario → Judgment → Explanation → Reflection) |
| If course type = tool-use | Require modeling (worked example with think-aloud) + coached practice. Fade scaffolding over 2-3 lessons. Exploration phase after scaffolding drops below 30% |
| If course type = compliance | Skip emotional design, social presence, and autonomy choice. Focus on clarity, feedback, and retrieval practice. Use light section template |

### By Audience Age

| Condition | Rule |
|---|---|
| If audience = 5-7 | High social presence, concrete visual-only worked examples, no interleaving, no abstract SRL (use progress indicators instead), emotional design = high (warm palette, rounded shapes, friendly character) |
| If audience = 8-11 | Social presence high, emotional design medium, SRL = simple self-check prompts ("Did I include all three parts?"), interleaving = never, worked examples = concrete with pictures |
| If audience = 12-16 | Social presence medium, emotional design medium, SRL = full cycle (predict → monitor → reflect), interleaving = conditional (only for visual/math content), worked examples = full format with fading |
| If audience = 17+ general | Social presence low-medium, emotional design = subtle (no anthropomorphism), SRL = full cycle, interleaving = conditional, feedback depth matches prior knowledge |
| If audience = 17+ professional | Social presence = low (reflection only, no peer framing), emotional design = clean typography / whitespace only, high autonomy, feedback = concise, worked examples = case studies instead |

### By Content Attributes

| Condition | Rule |
|---|---|
| If content = verbal/expository | Use blocked practice (never interleave). Self-explanation prompts work well (g=0.55). Segmentation reduces cognitive load |
| If content = visual/pattern | Interleaving recommended (g=0.67). Worked examples with varied surface features improve transfer (~d=0.80) |
| If content = procedural/multi-step | Worked examples (g=0.48) + fading (d=0.46-0.82) are highest-leverage. Pair with self-explanation prompts on each step |
| If content = abstract/conceptual | Start with pretraining to define key terms. Self-explanation (g=0.55) and analogies are more effective than worked examples |
| If learner prior knowledge = low | Worked examples (g=0.48), elaborated feedback only (EFE), high segmentation, scaffolded SRL prompts |
| If learner prior knowledge = high | Case studies over worked examples (expertise reversal), concise feedback, lower segmentation, autonomy-supported practice |

### By Delivery Context

| Condition | Rule |
|---|---|
| If self-paced | Skip audio-only modality (modality effect reverses). Embed SRL prompts as required checkpoints. Social presence = reflection, not interaction |
| If synchronous/cohort | Social presence effects strengthen (r=.43). Peer prompts can include discussion. Audio/video modality is effective (d~0.72 system-paced → applies here) |
| If mobile-first | Higher segmentation required. One concept per card, not per lesson. Progress indicators critical for SRL |

---

## 19. Course-Type × Research-Front Matrix

Each cell: **Required / Recommended / Optional / Skip** based on the applicability of each research front to that course type's learning goals.

| Front | Knowledge | Skill | Decision | Tool-use | Compliance |
|---|---|---|---|---|
| SDT Engagement | Required | Required | Required | Required | Recommended |
| Multimedia Principles | Required | Required | Required | Required | Required |
| Feedback Quality | Required | Required | Required | Required | Required |
| Self-Explanation | Recommended | Required | Required | Recommended | Recommended |
| Retrieval Practice | Required | Required | Required | Required | Recommended |
| CLT / Segmentation | Required | Required | Required | Required | Required |
| Assessment Alignment | Required | Required | Required | Required | Required |
| Self-Regulated Learning | Recommended | Required | Required | Required | Skip |
| Worked Examples | Optional | Required | Recommended | Required | Skip |
| Cognitive Apprenticeship | Skip | Required | Required | Required | Skip |
| Social Presence | Recommended | Recommended | Recommended | Optional | Optional |
| Onboarding | Required | Required | Required | Required | Required |
| Accessibility / UDL | Required | Required | Required | Required | Required |
| Emotional Design | Recommended | Recommended | Recommended | Optional | Skip |
| Desirable Difficulties | Recommended | Required | Required | Recommended | Optional |
| Interleaving | Skip | Conditional | Conditional | Skip | Skip |
| Interaction-First Design | Recommended | Required | Required | Required | Recommended |

---

## 20. Consolidated Age-Gate Table

Recommended intensity for each research front across age bands. Values: **High / Medium / Low / Skip**.

| Front | 5-7 | 8-11 | 12-16 | 17+ General | 17+ Professional |
|---|---|---|---|---|
| Social Presence | High | High | Medium | Low | Low (reflection only) |
| Emotional Design | High | Medium | Low | Low | Skip anthropomorphism |
| SRL | Progress indicators only | Self-check prompts | Full cycle | Full cycle | Full cycle |
| Worked Examples | Visual only, concrete | Concrete + pictures | Full + fading | Full + fading | Case studies |
| Interleaving | Never | Never | Conditional | Conditional | Conditional |
| Self-Explanation | Fill-blank / predirected only | Fill-blank / interrogative | All formats | All formats | All formats |
| SDT Autonomy | Low | Medium | High | High | Very High |
| SDT Relatedness | High | High | Medium | Medium | Low |
| Onboarding | Playful curiosity | Playful curiosity | Intellectual curiosity | Intellectual curiosity | Business-casual |
| Feedback Depth | Full elaboration | Full elaboration | Moderate elaboration | Moderate | Concise |
| CA | Modeling + exploration only | + Scaffolding | Full 6-method | Full 6-method | Full 6-method |
| Assessment | Recall only | Recall + apply | Recall + apply + analyze | All levels | All levels |
| Multimedia Principles | High | High | High | High | High |
| Accessibility / UDL | Required | Required | Required | Required | Required |
| Desirable Difficulties | Skip | Framing only | Full framing | Full framing | Full framing |
| Interaction-First Design | Structured only | Guided interaction | Full interaction-first | Full interaction-first | Efficient scenarios |

---

## 21. Transfer-Appropriate Processing

### Key Findings
- **Transfer-appropriate processing** (Morris, Bransford & Franks 1977, 4k+ citations): Memory and skill transfer are maximized when the practice format matches the format of the final performance task. Recognition practice → recognition performance; recall practice → recall performance; application practice → application performance.
- **Near vs. far transfer**: Barnett & Ceci (2002, k=149, 375+ effects): Transfer is a function of content domain, physical context, temporal context, functional context, and modality. Near transfer (same domain, similar context) is easier to achieve; far transfer (different domain, novel context) requires varied practice with multiple exemplars.
- **Practice format effects**: Van Merriënboer & Kester (2005, whole-task practice review): Whole-task practice with varied real-world contexts produces superior transfer compared to part-task practice with isolated skills. The effect is strongest for complex procedural skills.
- **Simulation fidelity**: Hamstra et al. (2014, review): Functional task alignment (matching the cognitive operations) matters more than physical fidelity (matching the look). A text-based scenario can produce equivalent transfer to a high-fidelity simulation if the decision process is identical.
- **MCG implications**: For skill courses → use SCORM simulations or scenario-based practice (not recall quizzes). For knowledge courses → quiz recall and comprehension formats are appropriate (transfer demand is low). For decision-making → scenario-based judgment exercises with novel cases.

### Boundary Conditions
- **Not all content needs far transfer**: Awareness/compliance courses aim for recognition and recall, not application. Over-investing in simulation for these courses wastes effort — use quiz-based retrieval instead.
- **Age 5-7 constraint**: Transfer-appropriate practice for young learners should use concrete, context-bound formats. Abstract transfer scenarios (e.g., "imagine you're a manager...") are inappropriate. Use the same surface features as instruction, then vary gradually.
- **Course type is the primary gate**: Skill and decision-making courses need practice formats that match the real-world task (simulations, scenarios). Knowledge courses are served by recall + comprehension quizzes. Tool-use courses need hands-on practice in the actual tool or a realistic mock.

### Anti-Patterns
- **Format mismatch**: Teaching troubleshooting but only assessing recall of definitions. The practice format must mirror the final performance task.
- **Premature far transfer**: Asking learners to apply concepts in novel contexts before they've demonstrated near transfer. Progress from near (same context) to far (varied context).
- **Over-investment in fidelity**: Building a high-fidelity simulation for a simple recall objective. Match practice complexity to outcome complexity.

### Prompt Coverage
- `<COURSE_TYPE_MATRIX>` — each type now has `PRACTICE_FORMAT` field defining appropriate practice types
- `<SECTION_TEMPLATE>` — skill template includes Worked Example → Completion → independent practice
- `<YOUR_TURN_RULES>` — task-to-block mapping for application practice
- Note: The COURSE_TYPE_MATRIX's `PRACTICE_FORMAT` field directly encodes transfer-appropriateness per course type.

### Priority: Medium (for skill/decision courses: High)

### Key Sources
- Morris, Bransford & Franks (1977) — Transfer-appropriate processing
- Barnett & Ceci (2002) — Transfer taxonomy (k=149, 375+ effects)
- Van Merriënboer & Kester (2005) — Whole-task practice review
- Hamstra et al. (2014) — Simulation fidelity review
- Haladyna et al. (2002) — MCQ item-writing (k=91)

---

## 22. Andragogy (Adult Learning)

### Key Findings
- **Andragogy framework** (Knowles 1984, 12k+ citations): Adults learn differently from children — five core assumptions: self-concept (self-directed), experience (resource for learning), readiness (relevant to roles), orientation (problem-centered), motivation (intrinsic). These map closely to SDT autonomy + competence needs.
- **Relevance is the primary driver**: Adult learners need to know WHY before WHAT. The transformation statement ("Go from X to Y") directly serves this — it answers the adult learner's first question: "Why should I invest time in this?"
- **Immediate applicability**: Adults prefer learning that can be applied immediately to real problems. The demo project and quick win in MCG courses directly address this — Module 1 should produce something usable.
- **Experience as resource**: Adults bring prior knowledge and experience. Courses should activate prior knowledge (pretraining, analogy) and connect new concepts to existing mental models. Avoid treating adult learners as blank slates.
- **Problem-centered vs. subject-centered**: Adults prefer learning organized around problems/tasks rather than topics. Skill and decision-making courses should be structured as "here's a problem → here's how to solve it" rather than "here's a topic → here's what to know."

### Boundary Conditions
- **Already covered by SDT**: Most andragogy principles overlap with SDT autonomy (self-directed), competence (immediate applicability), and relatedness (experience as resource). High-priority andragogy additions are: explicit relevance framing in every lesson intro, and problem-centered section structuring.
- **Age 5-16 differs**: Andragogy does not apply to under-17 learners. For younger audiences, pedagogy (scaffolding, direct instruction, social presence) takes priority.
- **Professional context intensifies**: Professional adult learners have the strongest need for relevance and immediacy. Skip abstract theory sections; lead with the problem and work back to principles.

### Anti-Patterns
- **School-style framing**: "In this lesson you will learn about X" instead of "By the end of this lesson, you'll be able to do X." Always frame for immediate applicability.
- **Ignoring prior knowledge**: Teaching concepts adults already know because the template requires it. Use pretraining to activate prior knowledge, not to re-teach it.
- **Theory before relevance**: Starting with definitions and history before answering "why this matters to me." Every module intro must answer the relevance question first.

### Prompt Coverage
- `<GLOBAL_BEHAVIOUR> INSTRUCTOR_VOICE: warm-conversational` — adult-friendly tone
- `<SDT_ENGAGEMENT>` — autonomy, competence, relatedness (maps to andragogy)
- `<LEARNING_ARC> ARC_STEPS` — problem-centered arc
- `<MODEL_BEHAVIOUR_CONSTRAINTS>` — short paragraphs, clear outcomes
- Note: Andragogy is largely a consolidation of existing SDT, onboarding, and relevance rules. No new structural slots needed.

### Priority: Medium (consolidation; already covered by SDT)

### Key Sources
- Knowles, M. (1984) — Andragogy in Action (12k+ citations)
- Merriam & Bierema (2014) — Adult Learning: Linking Theory and Practice
- Knowles, Holton & Swanson (2015) — The Adult Learner (8th ed.)

---

## 23. Productive Failure

### Key Findings
- **Productive failure** (Kapur 2008, 2016, N=600+ across multiple studies): Learners who attempt to solve complex problems BEFORE receiving instruction show superior transfer to learners who receive instruction first, even though they fail during the attempt phase. The failure is productive — it activates prior knowledge, highlights knowledge gaps, and prepares learners to encode the subsequent instruction more deeply.
- **Mechanism**: Productive failure works through: (a) activation of prior knowledge, (b) awareness of knowledge gaps, (c) attention to critical features during instruction, (d) deeper encoding of the correct solution. It is NOT about letting learners struggle indefinitely — it requires structured scaffolding during the attempt phase.
- **Effect size**: Kapur & Bielaczyc (2012): d=0.38–0.63 for transfer outcomes. Loibl & Rummel (2014): d=0.43 for conceptual knowledge. Sinha & Kapur (2021, k=23, 57 ES): g=0.36 overall, g=0.44 for transfer. Effect is stronger for complex, multi-solution problems than for well-defined single-solution problems.
- **Design principles** (Kapur 2016): (1) Generate multiple representations/solutions during attempt phase, (2) Compare and contrast solutions during consolidation phase, (3) Provide canonical solution only after attempt. The attempt phase should be collaborative for adults, individual for under-16.

### Boundary Conditions
- **NOT for beginners on foundational content**: Productive failure works when learners have relevant prior knowledge to activate. For true novices (first exposure to a domain), direct instruction + worked examples outperforms PF (Kalyuga 2003 expertise reversal). Reserve PF for intermediate+ learners.
- **NOT for ages 5-7**: Young learners lack the metacognitive capacity to benefit from unstructured exploration before instruction. Modeling + guided practice is superior (see CA progression).
- **Content type gate**: PF is most effective for complex, multi-solution, ill-structured problems (troubleshooting, design, analysis, decision-making under uncertainty). It adds no value for well-defined facts, terminology, or simple procedures.
- **Course type fit**: Recommended for decision-making and advanced skill courses. Skip for knowledge/awareness, compliance, and introductory skill courses.
- **Risk of frustration**: Without facilitation, learners can become frustrated and disengaged. The attempt phase must be time-boxed (5-10 min) and include minimal scaffolding (hints, guiding questions). It should NOT feel like a test.

### Anti-Patterns
- **Productive failure = unguided discovery**: PF is NOT letting learners flounder. The attempt phase requires structure — guiding questions, time limits, and scaffolding for generating representations.
- **Using PF for beginners**: Dropping a novice into a complex troubleshooting scenario without prior instruction causes unproductive failure (confusion, anxiety, encoding of incorrect procedures).
- **No consolidation**: Allowing learners to attempt and fail but never providing the canonical solution. The failure is only productive if followed by explicit instruction that builds on what learners tried.
- **Overuse**: More than one PF episode per module leads to fatigue and diminishing returns. One well-designed PF per module is sufficient.

### Prompt Coverage
- `<COURSE_TYPE_MATRIX> decision-making` — `PRODUCTIVE_FAILURE: recommended` (see below)
- `<COURSE_TYPE_MATRIX> tool-use` — `PRODUCTIVE_FAILURE: recommended` for advanced modules
- `<CONFLICT_MATRIX>` — PF vs beginner-friendly onboarding: beginners get instruction-first; intermediate+ get attempt-first
- Note: Productive failure applies as an optional pre-lesson phase for intermediate+ learners. It overrides the default instruction-first sequence for that lesson. Mark PF lessons as [PF] in the outline.

### Priority: Conditional (High for decision-making/advanced skill; Skip for beginner/knowledge)

### Key Sources
- Kapur, M. (2008) — Productive failure (Cognition & Instruction)
- Kapur, M. (2016) — Productive failure design principles (Educational Researcher)
- Kapur & Bielaczyc (2012) — PF in authentic classrooms (d=0.38–0.63)
- Loibl & Rummel (2014) — PF conceptual knowledge (d=0.43)
- Sinha & Kapur (2021) — PF meta-analysis (k=23, 57 ES, g=0.36)
- Kalyuga (2003) — Expertise reversal (boundary condition for PF)

---

## 24. Interaction-First Design (Active Learning)

### Key Findings
- **Harvard active learning study** (Deslauriers et al. 2019, *PNAS*): Students in introductory physics scored significantly higher on tests after active learning sessions than after lectures — yet *felt* they learned more from lectures. This "illusion of knowledge" means learner satisfaction metrics systematically underestimate active learning's effectiveness.
- **63% vs 5% participation**: Engageli (2024) found 62.7% participation in active learning sessions vs. just 5% in lecture formats — 13× more learner talk time and 16× higher non-verbal engagement.
- **55-study review** (WJARR 2025): Interactive teaching methods significantly improve student engagement, historical analysis, critical thinking, and argument construction compared to traditional lecture-based teaching. Benefits were consistent across student groups and strongest for at-risk learners.
- **Brilliant.org model** (launched 2012, 10M+ learners): Interaction-first design — learners solve puzzles and manipulate concepts *before* receiving explanation. Co-founder Sue Khim (2026) distinguishes "moment of explanation" from "moment of understanding," arguing most edtech optimizes the former. Brilliant optimizes the latter by making learners do the work rather than read generated text.
- **Brilliant's Koji AI tutor** (2026): Graphical tutor that watches learners interact with problems and responds by pointing, sketching, and annotating. Research on human tutoring supports this — the more interactive the tutoring conversation, the more time-on-task, which is the primary driver of tutoring effectiveness.
- **Meta-awareness gap** (Bjork & Bjork 2011; Deslauriers 2019): Learners and instructors systematically underestimate the value of active/interactive approaches because they feel harder. This "desirable difficulty" is a feature, not a bug — the cognitive effort that feels like confusion is what drives deeper encoding.
- **Active learning meta-analyses**: Hattie (2017): active learning d=0.47 (946 effects). Freeman et al. (2014, k=225): active learning increased exam performance by ~0.47 SD in STEM and reduced failure rates by 1.5×.
- **Interaction quality matters**: Chi & Wylie (2014, ICAP framework) — Interactive > Constructive > Active > Passive. True interaction (dialogue, co-construction) outperforms mere activity (manipulation without reflection). For self-paced courses, design for the Constructive–Interactive boundary.

### Boundary Conditions
- **Course type fit**: Highest value for skill-building, decision-making, and problem-solving courses where understanding emerges from doing. For pure knowledge/awareness courses (facts, definitions, compliance), lighter interaction (retrieval quizzes + self-explanation) is sufficient — full puzzle-driven design adds development cost without proportional learning gain.
- **Self-paced constraint**: Full interactive dialogue (human tutoring) is impossible. The interaction must be designed into the content — puzzles, simulations, scenario-based choices, drag-and-drop reasoning, with elaborated feedback as the "dialogue partner." Koji's approach (AI that watches and responds) is the emerging solution.
- **Age 5-7**: Interaction should be concrete and guided — manipulative-style puzzles with clear success criteria. Open-ended exploration without scaffolding causes unproductive failure. Use structured interaction (drag, sort, match) rather than generative interaction (explain, create).
- **Age 17+ professional**: Interaction should feel efficient and relevant, not gamified. Scenario-based decisions and case analysis outperform puzzle-game mechanics. Frame interaction as "test your thinking" not "play."
- **Learner perception management**: Because active learning feels harder, courses must proactively frame the difficulty. Include learner-facing statements: "This may feel challenging — that means your brain is building stronger connections. Keep going."
- **Prior knowledge floor**: True novices need some upfront instruction before meaningful interaction. A worked example or concise explanation (1-2 min) before interaction prevents unproductive flailing. The interaction-first approach means *interaction before full explanation*, not *interaction without any explanation*.
- **Interaction ≠ clicking**: Adding click-to-reveal or drag-to-sort without requiring cognitive effort is "interaction theater." Every interactive element must require the learner to make a decision, predict an outcome, or evaluate a possibility.

### Anti-Patterns
- **Info-first default**: Every lesson starting with a block of explanatory text before any hands-on engagement. Default should be: hook (puzzle/question) → attempt → feedback → explanation → apply. The explanation is the *punchline*, not the *opening*.
- **Interaction theater**: Tappable elements that add no cognitive demand — click-to-continue, decorative animations, drag-to-reveal that shows the same text. Every interaction should require thinking.
- **Ignoring the perception gap**: Learners who rate a course poorly because it "made me confused" may have learned more than from a smooth, passive course. Include framing that normalizes productive struggle.
- **Passive video-first**: Defaulting to video lectures as the primary delivery mode. In self-paced courses, video is passive consumption. If video is used, embed interactive checkpoints (pause-and-predict, in-video questions).
- **Gamification without learning**: Adding points, badges, and streaks without ensuring the underlying interaction has cognitive depth. Gamification sustains motivation; it does not replace pedagogical interaction.
- **One-size interaction**: Using the same interactive format (e.g., multiple-choice quiz) for every lesson. Vary interaction types: prediction, sorting, scenario choice, drag-to-match, free-response with model answer comparison.

### Prompt Coverage
- No current dedicated section. Suggested: `<PEDAGOGY> <INTERACTION_FIRST>` — interaction-first framing, interaction type variety, perception framing, age and course-type gates
- Also impacts: `<LESSON_TEMPLATE>` — should default to hook→attempt→explain structure rather than info→quiz
- `<SECTION_TEMPLATE>` — the "full" template could be reordered: Hook/Challenge → Your Turn → Info → Quiz → Activity → Recap (vs. the current Info-first order)
- `<CONFLICT_MATRIX>` — interaction-first vs. direct instruction (novices): novices need brief upfront instruction before interaction

### Priority: High (directly addresses the foundational design philosophy — whether learners do before they read, or read before they do)

### Key Sources
- Deslauriers, L., et al. (2019) — *PNAS* 116(39): 19251–19257 (Harvard active learning study)
- Freeman, S., et al. (2014) — *PNAS* 111(23): 8410–8415 (active learning in STEM meta, k=225)
- Chi, M. T. H., & Wylie, R. (2014) — *Educational Psychologist* 49(4): 219–243 (ICAP framework)
- Hattie, J. (2017) — *Visible Learning: 250+ Influences on Achievement* (active learning d=0.47)
- Engageli (2024) — Active learning impact study (62.7% vs 5% participation)
- WJARR (2025) — Interactive teaching methods review (55 studies)
- Bjork, E. L., & Bjork, R. A. (2011) — desirable difficulties framework (meta-awareness gap)
- Khim, S. (2026) — Brilliant Koji launch (TBPN Digest: interaction-first tutor design)
- Witt, Wheeless & Allen (2004) — Immediacy meta (k=81, N=24,474) — indirect support: interaction increases perceived learning

---

## 25. Inductive & Discovery-Based Learning

### Key Findings
- **Guided discovery meta** (Alfieri et al. 2011, k=580, reviewed 164 studies): Enhanced/guided discovery consistently outperforms pure discovery and matches/exceeds direct instruction on retention and transfer. Assisted discovery with scaffolding g=0.30–0.56 vs. unassisted discovery. Key moderators: task feedback, worked examples, and explanatory prompts during discovery.
- **Bruner's foundational theory** (1961, ~33k citations): Discovery learning fosters intellectual potency, intrinsic motivation, and mnemic retention. Practice in discovering teaches information acquisition in a way that makes it more "readily viable in problem solving." However, Bruner cautioned discovery requires some base knowledge — it cannot happen from a blank slate.
- **Mayer's "three-strikes" case** (2004): Pure discovery methods consistently fail across three eras — discovery of problem-solving rules (1960s), conservation strategies (1970s), and LOGO programming (1980s). Guided discovery with structured activity, feedback, and clear learning goals is effective; pure discovery is not. Mayer: "There is sufficient research evidence to make any reasonable person skeptical about the benefits of discovery learning."
- **PBL meta-analyses** (Dochy et al. 2003, k=43, N=6,318): PBL students show significantly better skill application (g=0.46) and mixed/slightly negative results on factual recall (g=-0.04). PBL positive for knowledge application and retention over time. **(Strobel & van Barneveld 2009, k=8 meta-analyses, 37,609 participants)**: PBL superior for long-term retention (g=0.72), skill development (g=0.69), and mixed for knowledge acquisition (g=0.03).
- **PBL process meta** (Schmidt et al. 2011, k=22, N=2,452): Cognitive process of PBL — activating prior knowledge, encoding in context, elaborating through discussion — each contributes incrementally to learning outcomes. Proportional contribution: prior knowledge activation d=0.45, contextual encoding d=0.61, elaboration d=0.34.
- **Productive failure** (Kapur 2008, 2010, 2016): Learners who attempt complex problems before receiving instruction ("productive failure") outperform those who receive instruction first on transfer tasks (d=0.30–0.72). The initial struggle activates prior knowledge, generates awareness of knowledge gaps, and prepares learners to encode the subsequent instruction more deeply. The "failure" must be productive — structured to surface key conceptual features — not open-ended floundering.
- **Invention as preparation** (Schwartz & Bransford 1998, "time for telling"): Learners who invent their own solution formulas before a lecture learn more from the lecture than learners who study worked examples first. The invention task differentiates "knowing about" from "knowing with" — it creates a knowledge structure for the lecture to fill. Effect replicates across domains (Schwartz & Martin 2004, Kapur 2012).
- **Anchored instruction** (Bransford et al. 1990, Cognition & Technology Group at Vanderbilt): Video-based problem scenarios ("anchors") that embed multiple sub-problems within a realistic narrative. The "Jasper Woodbury" series — 12 video-based adventures requiring mathematics problem-solving — produced significant gains on complex problem-solving (d=0.40–0.80) and transfer to novel problems. Key: anchors are engaging, realistic, and problem-rich.
- **Narrative-centered learning meta** (Wouters et al. 2013, k=39, N=7,384): Serious games with narrative contexts outperform conventional instruction on retention (g=0.27) and transfer (g=0.23). Narrative increases motivation and perceived relevance. Effect is stronger when narrative is integrated with learning goals (not decorative).
- **"You" narrative framing** (Brunyé et al. 2011, N=100+): Second-person ("you") narrative increases self-referential processing and memory encoding compared to third-person. Learners remember more when the story positions them as the protagonist. For instructional content, "you" framing increases personal relevance and engagement.
- **Spectra2.0 inductive video pattern** (observed from ~250 engineering explainer videos): Unique combination of (1) problem-first framing ("You need X"), (2) attempt-fail-succeed cycle ("You try A — it fails"), (3) second-person "you are the inventor" perspective, (4) high-fidelity 3D visualization of mechanisms, (5) no talking head — the visual carries the explanation. Rather than standard educational video (talking head + slides), this is closer to PBL + anchored instruction + productive failure delivered through 3D animation.
- **Inductive vs. deductive meta** (Klahr & Nigam 2004, N=112, direct instruction vs. discovery in science): Direct instruction produced more correct learning of the control-of-variables strategy (77% vs. 23%). However, students who discovered the strategy showed better transfer to novel problems. The "equivalence of learning paths" study suggests both approaches have different strengths — deduction for accuracy, induction for transfer and depth.
- **Third space / video integration** (Theobald et al. 2020, k=105): Interactive video with embedded questions significantly improves learning outcomes (g=0.47) compared to passive video. Embedding inductive problem-solving prompts within video is more effective than video alone — the combination of inductive framing + interactive checking.

### Effect Size Summary Table (ranked by effect magnitude)

| Intervention / Approach | Effect Size | What It Means | Key Citation |
|------------------------|------------|---------------|--------------|
| **PBL — long-term retention** | g=0.72 | **Large.** PBL students retain knowledge far longer than lecture students | Strobel & van Barneveld (2009) |
| **PBL — skill development** | g=0.69 | **Medium-large.** PBL students are better at applying what they know | Strobel & van Barneveld (2009) |
| **PBL — contextual encoding** | d=0.61 | **Medium-large.** Learning in problem context boosts encoding | Schmidt et al. (2011) |
| **Guided discovery (best cases)** | g=0.56 | **Medium.** Scaffolded discovery works; the better the scaffolding, the stronger the effect | Alfieri et al. (2011) |
| **Anchored instruction — transfer** | d=0.40–0.80 | **Medium-large.** Video-based problem scenarios improve transfer to novel problems | Bransford et al. (1990) |
| **Productive failure — transfer** | d=0.30–0.72 | **Small-large.** Trying before instruction boosts transfer; varies by design quality | Kapur (2008–2016) |
| **PBL — prior knowledge activation** | d=0.45 | **Medium.** PBL works partly because it surfaces what learners already know | Schmidt et al. (2011) |
| **PBL — knowledge application** | g=0.46 | **Medium.** PBL learners apply knowledge better than lecture learners | Dochy et al. (2003) |
| **Interactive video w/ prompts** | g=0.47 | **Medium.** Embedding inductive prompts in video beats passive video | Theobald et al. (2020) |
| **Narrative-centered learning — transfer** | g=0.23 | **Small-medium.** Stories boost transfer but effect is modest | Wouters et al. (2013) |
| **Narrative-centered learning — retention** | g=0.27 | **Small-medium.** Narratives help retention slightly | Wouters et al. (2013) |
| **PBL — elaboration (discussion)** | d=0.34 | **Small-medium.** Discussion during PBL contributes modestly | Schmidt et al. (2011) |
| **Guided discovery (average)** | g=0.30 | **Small-medium.** Average across all guided discovery studies | Alfieri et al. (2011) |
| **Pure discovery** | g≈0.00 | **None or negative.** Unassisted discovery does not outperform direct instruction | Mayer (2004), Alfieri (2011) |
| **PBL — factual recall** | g=-0.04 | **Slightly negative.** PBL students recall slightly fewer isolated facts than lecture students | Dochy et al. (2003) |

**Takeaway:** The strongest effects are on **long-term retention** and **transfer** (applying knowledge to new problems), not on immediate recall of facts. This is exactly what the spectra2.0 inductive video pattern optimises for — the videos teach *understanding of how things work*, not memorisation of dates or terminology. The weakest approach (pure discovery) is also the most common mistake — putting learners in an open problem without scaffolding, which the spectra2.0 pattern avoids by guiding step-by-step.

### Boundary Conditions
- **Pure discovery is harmful for novices**: Multiple meta-analyses converge: pure/unassisted discovery consistently underperforms guided discovery and direct instruction for learners with low prior knowledge. Cognitive load theory explains this — unstructured problem spaces overwhelm working memory. Guided discovery with scaffolds (cues, prompts, partial solutions) is the effective form.
- **Prior knowledge floor**: Induction works when learners have enough domain knowledge to generate productive hypotheses. For ages 5-7 or absolute beginners, brief upfront instruction before inductive exploration prevents confusion. Kirschner, Sweller & Clark (2006) argue minimal guidance fails because it ignores human cognitive architecture — working memory limits make unstructured exploration ineffective for novices.
- **Age differentiation**: Ages 5-7 can engage with structured discovery (specific puzzles with clear right/wrong) but not open inquiry. Ages 8-11 benefit from guided discovery with moderate scaffolding (problem framed, steps supported). Ages 12+ can handle productive failure and open inquiry. The spectra2.0 video pattern (structured step-by-step discovery) is appropriate for ages 8+.
- **Self-paced constraint**: PBL and discovery learning were designed for cohort-based, facilitator-guided settings. In self-paced, the facilitator scaffolding is absent — the content must embed the guidance. The spectra2.0 video pattern is a naturally self-paced form: the step-by-step visual narrative IS the scaffolding.
- **Content type gate**: Inductive approaches work best for conceptual/procedural content where the learner can "discover" the underlying principle. For fact-recall domains (terminology, compliance rules, dates), direct instruction is more efficient. The spectra2.0 videos succeed because they teach *how mechanisms work* — a domain ideal for inductive exploration.
- **Inductive bias in video**: Learners may form incorrect generalizations if the examples are too narrow. The spectra2.0 videos show single-example narratives (one compass story, one fortress). Multiple examples with varied surface features reduce this risk (variability principle, see §14).
- **Narrative must serve the learning**: Second-person "you" framing increases engagement but can feel forced. Effective only when the narrative leads naturally to the learning content — not when "you" is pasted onto dry explanation.

### Anti-Patterns
- **Pure discovery**: Dropping learners into an ill-structured problem without scaffolding, cues, or feedback. Research consensus: this harms learning for all but the highest-knowledge learners.
- **Productive floundering**: Confusing "productive failure" with "giving up." The "failure" must surface specific knowledge gaps that the subsequent instruction addresses. Unstructured struggle that leads nowhere is unproductive failure.
- **Anchored but not instructional**: Showing a compelling video scenario without extracting the learning from it. The anchor must be followed by structured problem-solving, not just watched.
- **Narrative without learning**: A compelling story that entertains but doesn't teach. Every narrative element must serve a pedagogical purpose. The spectra2.0 pattern avoids this by making the "plot" = the problem-solving process itself.
- **Self-paced PBL without structure**: Offering open-ended problems in a self-paced course with no facilitator. Without embedded guidance (worked examples, hints, sub-goals), learners flounder. The guided narrative structure of spectra2.0 videos solves this — the video IS the scaffold.
- **Deductive default in course design**: Every lesson starting with "Here's the principle" → example → practice. This is the deductive pattern. An inductive alternative: "Here's a problem" → attempt → feedback → principle revealed. Most course templates default to deductive. MCG's current templates follow the deductive pattern (Info → Quiz). Induction-first would be a structural change.
- **One-shot examples**: A single inductive narrative (one story, one example) that learners over-generalize from. The spectra2.0 videos use single examples per video — this is a limitation. Multiple varied examples would strengthen generalization (variability principle, §14).

### Prompt Coverage
- No current section. Suggested: `<PEDAGOGY> <INDUCTIVE_LEARNING>` — inductive vs. deductive framing, guided discovery parameters, productive failure structure, narrative framing, age and content-type gates. Should reference `<MULTIMEDIA_PRINCIPLES>` for the video/visual component.
- Also affects: `<LESSON_TEMPLATE>` — consideration for a problem-first template variant where the lesson opens with a scenario/challenge rather than informational text.
- Also affects: `<LANDING_PAGE_TEMPLATE>` — inductive courses emphasize transformation (from confused to capable), matching the problem-to-mastery arc.
- `<COURSE_TYPE_MATRIX>` — inductive approaches apply to skill-building and conceptual courses, NOT fact-recall/awareness courses.

### Priority: Medium (high for courses targeting transfer and conceptual depth; low for fact-recall/awareness courses)

### Key Sources
- Alfieri, L., Brooks, P. J., Aldrich, N. J., & Tenenbaum, H. R. (2011) — *Journal of Educational Psychology* 103(1): 1–18 (k=580, discovery learning meta)
- Bruner, J. S. (1961) — *Harvard Educational Review* 31: 21–32 (act of discovery)
- Mayer, R. E. (2004) — *American Psychologist* 59(1): 14–19 (three-strikes against pure discovery)
- Kirschner, P. A., Sweller, J., & Clark, R. E. (2006) — *Educational Psychologist* 41(2): 75–86 (minimal guidance critique)
- Kapur, M. (2016) — *Journal of the Learning Sciences* 25(1): 51–94 (productive failure synthesis)
- Schwartz, D. L., & Bransford, J. D. (1998) — *Cognition and Instruction* 16(4): 475–522 (time for telling)
- Bransford, J. D., et al. (1990) — *Journal of Educational Psychology* (anchored instruction, Jasper series)
- Dochy, F., et al. (2003) — *Educational Psychology Review* 15(3): 231–279 (PBL meta, k=43)
- Strobel, J., & van Barneveld, A. (2009) — *Interdisciplinary Journal of Problem-based Learning* 3(1): 44–58 (PBL meta-analysis, 8 reviews)
- Schmidt, H. G., Rotgans, J. I., & Yew, E. H. J. (2011) — *Medical Education* 45(8): 792–806 (PBL process meta)
- Wouters, P., et al. (2013) — *Journal of Educational Psychology* 105(2): 249–265 (narrative learning meta, k=39)
- Klahr, D., & Nigam, M. (2004) — *Psychological Science* 15(10): 661–667 (direct instruction vs. discovery)
- Brunyé, T. T., et al. (2011) — *Memory & Cognition* 39(2): 290–300 ("you" narrative framing)
- Theobald, M., et al. (2020) — *Educational Psychology Review* 32(4): 985–1004 (interactive video meta)

---

---

## 26. Media Landscape: Inductive/Discovery-Based Learning Content

### Overview
<MEDIA_LANDSCAPE>
  Comprehensive search for learning media (videos, games, web platforms, apps) across 9 domains that use the same inductive/discovery-based approach as spectra2.0 — short-form, question-driven, show-don't-tell, making the learner figure out how something works before revealing the answer. Rated 0–100 by match to the spectra2.0 pattern. Domains covered: engineering/physics, science, math, philosophy, geography, programming, language, history, genealogy.
</MEDIA_LANDSCAPE>

### Tier 1: Very Close Match (75–100)
<MEDIA_TIER1>

| Media | Type | Subject | Rating | Why | Link |
|---|---|---|---|---|---|
| **spectra2.0** (Facebook Reels) | Short video | **Engineering** | **100** | The reference — shows mechanism first, asks "how does it work?" before revealing the answer in seconds | [spectra2.0](https://www.facebook.com/spectra2.0/) |
| **Practical Engineering** (Grady) | YT long-form | **Engineering** | **82** | Shows phenomena first (dam failure, sinkhole), then reveals engineering principle. Curiosity-first approach is the closest long-form analog | [Practical Engineering](https://www.youtube.com/@PracticalEngineeringChannel) |
| **EngineerGuy** (Bill Hammack) | YT | **Engineering** | **78** | Tear-downs that reveal inner workings. Opens with a mystery — "what's inside this?" — then dissects | [EngineerGuy](https://www.youtube.com/@engineerguyvideo) |
| **The Action Lab** | YT | **Physics** | **76** | "What happens if I ___?" format. Poses question, shows experiment, then explains. Question-first hook matches spectra2.0's rhythm | [The Action Lab](https://www.youtube.com/@TheActionLab) |
| **Applied Science** | YT | **Engineering** | **75** | Deep discovery — builds things from scratch to figure out how they work. Pure inductive process, though longer format | [Applied Science](https://www.youtube.com/@AppliedScience) |

</MEDIA_TIER1>

### Tier 2: Strong Inductive Component (60–74)
<MEDIA_TIER2>

| Media | Type | Subject | Rating | Why | Link |
|---|---|---|---|---|---|
| **PhET Interactive Simulations** | Web app | **Science** | **72** | Pure discovery sandboxes: manipulate variables, observe outcomes, infer the rule. No lectures. Perfect for course integration | [PhET](https://phet.colorado.edu/) |
| **Brilliant.org** | Web/App | **Math/CS** | **70** | "Learn by doing" — every lesson is a guided discovery problem. Interactive, immediate feedback. Covers math, CS, physics | [Brilliant](https://brilliant.org/) |
| **SmarterEveryDay** (Destin Sandlin) | YT | **Engineering** | **68** | Uses slow-motion to reveal hidden mechanics. Curious-first: "I wonder how this works" | [SmarterEveryDay](https://www.youtube.com/@smartereveryday) |
| **Stuff Made Here** (Shane) | YT | **Engineering** | **65** | Builds solving process in real-time — failures, iterations, discoveries. Inductive by nature of engineering | [Stuff Made Here](https://www.youtube.com/@StuffMadeHere) |
| **Mark Rober** | YT | **Engineering** | **62** | Problem-first (e.g. "how to catch a package thief") then builds solution. Less pure discovery, more narrative engineering | [Mark Rober](https://www.youtube.com/@MarkRober) |
| **The Witness** | Game | **Philosophy** | **72** | Pure inductive — teaches game rules entirely through environmental experimentation. No text, no tutorial. Player discovers philosophical themes (consciousness, perspective) through earned insight | [The Witness](https://store.steampowered.com/app/210970/The_Witness/) |
| **3Blue1Brown** | YT | **Math** | **70** | "Invent math" approach — visual discovery of mathematical principles. Problem-first, builds solution visually. Strong guided-inductive pattern | [3Blue1Brown](https://www.youtube.com/@3Blue1Brown) |
| **DragonBox Algebra** | App | **Math** | **66** | Teaches algebra through tile manipulation without ever showing equations. Pure discovery — learner infers the rules of algebraic manipulation by experimenting | [DragonBox](https://dragonbox.com/) |
| **The Talos Principle** | Game | **Philosophy** | **65** | Puzzle-solving gated by philosophical questions. Player must solve each puzzle to progress the narrative about consciousness, identity, freedom | [The Talos Principle](https://store.steampowered.com/app/257510/The_Talos_Principle/) |
| **Pivot Interactives** | Web | **Science** | **62** | Students observe real video phenomena, take measurements, analyze data, infer scientific laws. Guided inquiry science platform | [Pivot Interactives](https://www.pivotinteractives.com/) |

</MEDIA_TIER2>

### Tier 3: Moderate (40–59)
<MEDIA_TIER3>

| Media | Type | Subject | Rating | Why | Link |
|---|---|---|---|---|---|
| **eduReels** | Mobile app | **General** | **58** | TikTok-style educational short-form. Matches format but content quality varies | [eduReels](https://edureels.com/) |
| **Veritasium** | YT | **Physics** | **55** | Poses counterintuitive questions, but often tells rather than lets you discover | [Veritasium](https://www.youtube.com/@veritasium) |
| **TED-Ed "How Things Work"** | YT | **Engineering** | **50** | Good "how it works" content but fully deductive — explains first. 349 lessons in collection | [TED-Ed](https://www.youtube.com/@TEDEd) |
| **Discovery Education** | Web platform | **Science** | **45** | Inquiry-based curriculum but classroom-oriented, not short-form | [Discovery Education](https://www.discoveryeducation.com/) |
| **Lesics** (Sabin Mathew) | YT | **Engineering** | **45** | Excellent 3D animations of machinery but deductive (narrator-led, not question-led) | [Lesics](https://www.youtube.com/@Lesics) |
| **Engineering Mindset** | YT | **Engineering** | **40** | Clear HVAC/electrical explanations but fully deductive | [Engineering Mindset](https://www.youtube.com/@EngineeringMindset) |
| **GeoGuessr** | Web/App | **Geography** | **55** | Dropped in random Street View location. Player uses visual clues (signs, flora, architecture, sun position) to deduce location. Pure inductive geography | [GeoGuessr](https://www.geoguessr.com/) |
| **Superliminal** | Game | **Philosophy** | **55** | Perspective-based dream puzzles. Player discovers size-manipulation mechanics through experimentation. Philosophical framing about perception | [Superliminal](https://store.steampowered.com/app/1029690/Superliminal/) |
| **Code.org Puzzles** | Web | **Programming** | **55** | Block-based coding puzzles (Minecraft, Angry Birds). Player figures out the correct sequence of commands by trial and error | [Code.org](https://code.org/) |
| **Euclidea** | App | **Math** | **52** | Geometric construction puzzles. Given compass and straightedge, figure out how to construct the target shape | [Euclidea](https://www.euclidea.xyz/) |
| **LightBot** | App | **Programming** | **48** | Puzzle game teaching programming logic. Player programs a robot by inferring command patterns through trial | [LightBot](https://lightbot.com/) |
| **Trolley Problem Interactives** | Web | **Philosophy** | **48** | Ethical dilemma platforms. Present the scenario, player chooses, sees consequences. Question-pause-answer pattern | [Trolley Problem (Moral Machine)](https://moralmachine.mit.edu/) |
| **DBQ Online** | Web | **History** | **45** | Document-based history inquiry. Students analyze primary sources to answer open-ended historical questions. Inductive inquiry method | [DBQ Online](https://www.dbqonline.com/) |
| **Wireless Philosophy (WiPhi)** | YT | **Philosophy** | **42** | Clean thought-experiment presentations. Poses philosophical puzzles (trolley, Chinese room, veil of ignorance) then walks through reasoning | [WiPhi](https://www.youtube.com/@WirelessPhilosophy) |
| **SciSim** | Web | **Science** | **42** | Interactive simulations across physics, chemistry, biology, CS. Manipulate variables and observe outcomes — pure sandbox discovery | [SciSim](https://scisim.org/) |

</MEDIA_TIER3>

### Tier 4: Weak/Nominal (<40)
<MEDIA_TIER4>

| Media | Type | Subject | Rating | Why | Link |
|---|---|---|---|---|---|
| **Crash Course Kids** | YT | **Science** | **35** | Fast-paced but tells-first | [Crash Course Kids](https://www.youtube.com/@crashcoursekids) |
| **Khan Academy** | YT/Web | **General** | **30** | Excellent quality but entirely deductive (teaches rule, then practice) | [Khan Academy](https://www.khanacademy.org/) |
| **Nat Geo Kids "How Things Work"** | YT | **Engineering** | **30** | Brief but deductive — expert explains to child | [Nat Geo Kids](https://www.youtube.com/@NatGeoKids) |
| **Discovery UK "How Things Work" TV** | TV | **Engineering** | **25** | Lecture format, no question-pause-reveal structure | — |
| **SciShow Kids** | YT | **Science** | **20** | Engaging but fully deductive | [SciShow Kids](https://www.youtube.com/@SciShowKids) |
| **Kurzgesagt** | YT | **General** | **15** | Beautiful animations but entirely exposition-based | [Kurzgesagt](https://www.youtube.com/@Kurzgesagt) |
| **Duolingo** | App | **Language** | **38** | Inductive language learning — infers grammar patterns from context before rules are shown. Question-answer format but low-cognitive-load recall | [Duolingo](https://www.duolingo.com/) |
| **Human Resource Machine** | Game | **Programming** | **35** | Programming puzzle game. Player figures out assembly-like instruction sequences by trial. Inductive but narrow | [HRM](https://store.steampowered.com/app/375820/Human_Resource_Machine/) |
| **Scratch** | Web | **Programming** | **30** | Creative coding sandbox. Pure discovery but no question-pause-reveal guidance. Learner must self-motivate | [Scratch](https://scratch.mit.edu/) |
| **Ancestry / FamilySearch** | Web/App | **Genealogy** | **30** | Genealogical discovery through records exploration. Detective-like but not structured as teachable moments | [FamilySearch](https://www.familysearch.org/) |
| **Seterra** | Web/App | **Geography** | **25** | Map quiz — tests existing knowledge recall, not discovery. Answer-first, not question-first | [Seterra](https://www.seterra.com/) |
| **Socratica** | YT | **Math/Science** | **25** | Clean math/science explainers but fully deductive. No question-pause-reveal | [Socratica](https://www.youtube.com/@Socratica) |

</MEDIA_TIER4>

### Insight for Course Design
<MEDIA_INSIGHT>

The spectra2.0 formula that scores 100 is: **Question → Pause (viewer predicts) → Reveal → Brief explanation**. No existing platform fully replicates this in long-form course format. The research in §18 explains why: pure discovery (g≈0.00) underperforms guided discovery. The sweet spot = **guided inductive** — pose the problem, let the learner attempt, then provide scaffolding. The spectra2.0 pattern is the video embodiment of this sweet spot.

**Implication for MCG courses:** A course that opens each module with an inductive video snippet (problem posed, viewer predicts mechanism) before the informational lesson would operationalize the guided discovery research. This is feasible within the MCG template by adding a `video` block at the start of each section that embeds a question-pause-reveal clip.
</MEDIA_INSIGHT>

### Prompt Coverage
- No current section. Suggested: `<MEDIA_LANDSCAPE>` — cross-references to `<PEDAGOGY> <INDUCTIVE_LEARNING>` for the research backing and `<MULTIMEDIA_PRINCIPLES>` for the video design rules. References: PhET Integration docs, Brilliant.org course design patterns, spectra2.0 reel structure analysis.

### Priority: Low (reference section — will be consulted when building inductive course templates)

---

*End of synthesis v8. 26 sections (18 research fronts + 7 cross-front/application sections + 1 media landscape). Section 26 expanded to cover 9 domains: engineering/physics, science, math, philosophy, geography, programming, language, history, genealogy — rated 0–100 on the inductive/discovery scale. The spectra2.0 pattern (Question → Pause → Reveal → Explanation) remains the unique gold standard (100) with no full-length course platform matching it.*
