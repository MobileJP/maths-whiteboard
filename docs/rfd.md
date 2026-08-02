# RFD: Maths Whiteboard — Claude-Taught Lessons + Handwritten Marking

**Status:** Draft for implementation
**Owner:** Aamir
**Implementation vehicle:** Claude Code in VS Code
**Last updated:** 2 August 2026
**Revision:** v3 — adds dual input (typed + handwritten), local answer checking, model routing, cost model

---

## 1. Summary

A browser-based, iPad-first study app for working through a Year 7 (KS3) maths curriculum. The screen is split: a **lesson panel** on the left where Claude teaches a topic and serves questions one at a time, and a **handwriting whiteboard** on the right. A collapsible panel at the bottom holds a free-text conversation scoped to the current question.

Answers are given one of two ways: **typed** for simple final answers, or **handwritten** on the whiteboard when the working matters. Typed answers are checked locally against a stored canonical answer at zero cost; handwritten working is marked by Claude, which transcribes it first, then gives a verdict and progressively-revealed help.

A lesson is started in one of three ways: picked from the 35-lesson scheme, typed as a topic, or **photographed from a physical textbook**.

The app exists to support a spaced, retrieval-practice-based study routine. Design decisions should favour **desirable difficulty over convenience**: the app must not make it trivially easy to skip the struggle.

---

## 2. Revision history

**v1 → v2:** PDF textbook viewer replaced with Claude-generated lessons. DRM-free Year 7 PDFs proved too fragile a dependency; the 35-lesson scheme became the spine instead of a book.

**v2 → v3:** Added a typed-answer path alongside handwriting. This turns out to be the single biggest cost and latency lever in the app — a typed answer compared against a stored canonical answer needs **no API call at all**. Also adds explicit model routing and a cost model.

---

## 3. Goals

- Learn a topic and practise it in one screen, with no external book required.
- Answer quickly by typing when only the answer matters; write by hand when the working matters.
- Get accurate marking of handwritten working, including where the first error occurred.
- Control how much help is revealed, per question.
- Remember which lessons are done and what was got wrong.
- Turn past errors into an automatic warm-up queue for future sessions.

## 4. Non-goals

- Not a multi-tenant product. Single user (auth is a lock on the door, not a user system).
- No classroom/collaborative features.
- No native iOS app. PWA only.
- **Not a textbook reproduction tool.** Photos identify the topic and question style; the app generates original explanation and original practice questions. It does not transcribe or reproduce book content.
- Not a replacement for working problems on paper — it's a teaching and marking layer.

---

## 5. Key decisions

### 5.1 Lesson sources

1. **From the scheme** — pick from the seeded 35-lesson Year 7 scheme (Number, Algebra, Ratio & Proportion, Geometry & Measures, Statistics, Probability). Default path; drives progress tracking.
2. **By topic** — type e.g. "adding fractions with different denominators".
3. **From a photo** — snap a page of a physical textbook. Claude identifies the topic and question style, then generates a lesson and its own practice questions in that style. This is what keeps the paper CGP books useful without needing them digitally.

### 5.2 Answer input modes

Each question declares a **preferred** input mode, but the user can always switch.

| Mode | When | Cost |
|---|---|---|
| **Typed** | Simple final answers — arithmetic, fractions, percentages, single values | **Free** (local check) |
| **Handwritten** | Multi-step working, algebra, geometry reasoning, anything where method matters | ~$0.014/submission |

Question generation sets `preferred_input` based on question type. Roughly: Number, Fractions, Percentages and Ratio default to typed; Algebra, Geometry and multi-step problems default to handwritten.

The whiteboard remains available on every question — writing by hand is better for encoding, so the app should never *discourage* it, only offer typing as the faster path when the answer is all that's being tested.

### 5.3 Framework

**Next.js (App Router) deployed to Netlify** via `@netlify/plugin-nextjs`. Google auth via Auth.js needs a server; Route Handlers give a clean, streaming-capable API layer.

### 5.4 Help policy — toggle per question

Every submission carries a `response_mode`:

| Mode | Behaviour |
|---|---|
| `mark_only` | Verdict + location of first error. No method, no answer. |
| `mark_and_hint` | The above, plus a single nudge toward the next step. |
| `full_solution` | The above, plus complete worked method and answer. |

Default is `mark_only`. Escalation buttons (**Hint**, **Show full solution**) appear after the verdict so the user climbs the ladder deliberately.

Hint and solution are generated *with the question* and stored, so escalation costs nothing at mark time. The trade-off is that a determined user could read them in devtools — acceptable for a single-user tool on the honour system.

---

## 6. Architecture

```
iPad Safari (PWA, added to Home Screen)
        │
        ▼
Next.js app on Netlify
 ├── /                Split-view study screen (client)
 ├── /api/lesson      Generate lesson from topic or photo (streaming) — Haiku, or Sonnet→Haiku when source is a photo (vision ID, then lesson text)
 ├── /api/questions   Generate questions + answers + solutions      — Sonnet
 ├── /api/check       Typed answer → local comparison               — NO MODEL
 ├── /api/mark        Handwriting → transcribe + verdict (streaming) — Sonnet
 ├── /api/explain     Explain a wrong typed answer (streaming)      — Haiku
 ├── /api/ask         Threaded conversation (streaming)             — Haiku
 ├── /api/review      Due items, grading
 └── Auth.js          Google OAuth
        │
        ├──► Neon Postgres  (lessons, questions, attempts, review queue)
        ├──► Blob storage   (submitted PNGs, source photos)
        └──► Anthropic API  (API key server-side only — never in the client)
```

---

## 7. Tech stack

| Concern | Choice | Notes |
|---|---|---|
| Framework | Next.js (App Router), TypeScript | Via `@netlify/plugin-nextjs` |
| Hosting | Netlify | |
| Auth | Auth.js (NextAuth v5), Google provider | Email allowlist in `signIn` callback |
| Database | Neon Postgres | **Neon serverless HTTP driver**, not a `pg` TCP pool |
| ORM | Drizzle | Neon driver support; Auth.js adapter |
| Maths rendering | KaTeX | Lesson and question text from LaTeX |
| Maths input | MathLive (or similar) | Typed answers with a maths keyboard on iPad |
| Answer checking | **mathjs** | Local numeric-substitution equivalence — see §9.2a |
| Whiteboard | Custom canvas, Pointer Events | See §10.3 |
| Blob storage | Netlify Blobs (or Cloudflare R2) | **Do not store images in Postgres.** 30-day retention — see §10.3 |
| AI | Anthropic API | Routing in §8 |
| Styling | Tailwind | |

---

## 8. Model routing

Cost is dominated by *which tasks call a model at all*, not by which model. Route by task:

| Task | Model | Why |
|---|---|---|
| **Typed answer check (the common case)** | **None** | Local comparison against stored answer. Free and instant. |
| Typed answer near-miss adjudication (§9.3, rare) | **Haiku** | Local check can't determine equivalence; the one deliberate exception to "no model call" — question, canonical answer and the user's input are supplied in context, so it's cheap even though it's a call |
| Question + answer + solution generation | **Sonnet** | Correctness is critical — a wrong canonical answer poisons every downstream mark |
| Handwriting transcription + marking | **Sonnet** | Hardest visual task in the app; ambiguous minus signs, indices, fraction bars |
| Photo → topic identification (part of `/api/lesson`) | **Sonnet** | Vision |
| Lesson text generation | **Haiku** | Explanatory prose; quality bar is lower and it's infrequent |
| Explaining a wrong typed answer | **Haiku** | Question, answer and solution are all supplied in context |
| Ask Claude chat panel | **Haiku** | Conversational; escalate to Sonnet on request |

Model IDs must be read from config, not hardcoded — check the current model strings in Anthropic's docs at build time. Store the model used on each attempt for cost attribution.

**Do not route handwriting marking to Haiku to save money.** At this usage it saves under $2/month, and the two things it degrades — transcription accuracy and canonical-answer correctness — are exactly the failures that make the app untrustworthy.

---

## 9. Answer checking (typed path)

This runs entirely client-or-server-side with no model call. It is the highest-leverage piece of the app and needs care to get right.

### 9.1 Question answer metadata

Each generated question stores:

```
answer_type        numeric | fraction | expression | ratio | text | multi
canonical_answer   string   -- the definitive form
accepted_forms     jsonb    -- e.g. ["1/2", "0.5", "50%"]
tolerance          number   -- for decimals, nullable
units              string   -- nullable, e.g. "cm²"
preferred_input    typed | handwritten
```

### 9.2 Normalisation and comparison

Before comparing, normalise both the user's input and the canonical answer:

- Strip whitespace, case-fold, remove trailing full stops
- Normalise unicode fractions (½ → 1/2), minus signs (−, –, - all equal)
- Strip or match units against the `units` field
- For `numeric`: compare within `tolerance`
- For `fraction`: compare as exact rationals, not floats — compare the **unreduced** input against the reduced canonical form first, so an unsimplified-but-correct fraction (`4/8` vs `1/2`) is detected as its own case rather than silently passing as identical; only reduce both sides for the final equality check
- For `expression`: use **mathjs** — see §9.2a for how
- For `ratio`: compare in simplified form, order-sensitive

### 9.2a Expression equivalence

mathjs's `simplify()` is not a full CAS and will not reliably prove that arbitrary equivalent forms (e.g. `2x+4` vs `2(x+2)`) reduce to the same tree. Prefer **numeric substitution**: parse both expressions, substitute the same set of random values for each variable across several trials, and compare the evaluated results within a small tolerance. This is more robust than symbolic simplification and cheap to run locally.

### 9.3 Near-miss escalation

If the local check fails but the answer is *close* — right value wrong units, unsimplified fraction, correct expression in an unexpected form — do **not** immediately mark it wrong.

- Right value, wrong/missing units → mark correct with a note
- Unreduced fraction, numerically equal → mark correct with a note to simplify (detected directly in §9.2, no escalation needed)
- Cannot determine equivalence locally (complex expressions) → **one Haiku call** to adjudicate — the single deliberate exception to the "no model call" rule, see §8

Everything else is marked incorrect locally, and only then does the user get the option to escalate to an explanation.

**This near-miss handling matters.** A locally-checked app that rejects `4/8` when the answer is `1/2` will feel broken and will erode trust faster than any model error.

---

## 10. Screen layout and behaviours

### 10.1 Layout (iPad landscape)

```
┌────────────────────────┬────────────────────────┐
│  LESSON                │  ANSWER                │
│  Unit 2 · Lesson 10    │  ┌──────────────────┐  │
│  Adding fractions      │  │                  │  │
│  ┌──────────────────┐  │  │  whiteboard      │  │
│  │ explanation      │  │  │  canvas          │  │
│  │ worked example   │  │  │                  │  │
│  │ ─────────────    │  │  └──────────────────┘  │
│  │ Q3 of 8          │  │  ✏️ ⌫ ↶ ↷  🗑          │
│  │ Work out ⅔ + ⅕   │  │  ── or type ──────────  │
│  └──────────────────┘  │  [ answer field   ]     │
│  ↺ explain differently │  Mode: [Mark only ▾]   │
│  ＋ more examples       │  [ Submit ]            │
├────────────────────────┴────────────────────────┤
│  ⌃ Ask Claude                        (collapsed) │
└─────────────────────────────────────────────────┘
```

- Right pane shows **both** input affordances. Whichever the user touches first becomes the active mode; the other collapses.
- On typed-preferred questions the answer field is focused and the whiteboard collapses to a thin "show whiteboard" strip.
- Typed input uses a maths keyboard (MathLive) so fractions, indices and roots are enterable on iPad.
- Divider is draggable; position persisted to localStorage.
- **Portrait:** panes stack vertically with a toggle to expand either.
- Current question is **sticky at the bottom** of the lesson pane so it stays visible while writing.

### 10.2 Starting a lesson

Home screen shows the 35-lesson scheme with progress, plus a **"Teach me…"** box and **"Snap a page"** (`<input type="file" accept="image/*" capture="environment">` opens the iPad camera; also accept paste and upload).

Lessons persist — returning to a topic reopens the existing lesson rather than regenerating, unless a fresh one is requested.

Lesson controls: **explain differently**, **more examples**, **more questions**, **harder / easier**, **flag question**.

### 10.3 Whiteboard

- **Pointer Events**, not touch events. Filter to `pointerType === 'pen'` when a pen is detected → palm rejection.
- Honour `pressure` for stroke width.
- `touch-action: none` on the canvas to stop Safari scrolling/zooming mid-stroke.
- Scale the backing canvas by `devicePixelRatio` — without this, handwriting is fuzzy on Retina.
- **Store strokes as vectors** (points with pressure), not a bitmap. Makes undo/redo trivial, allows re-render at any resolution, and lets an attempt be replayed.
- Tools: pen, eraser, undo, redo, clear.
- Export to PNG on submit, downscaled to ~1568px long edge on white.
- **Blob retention: 30 days**, then delete. Strokes (the durable source of truth for replay) live in Postgres indefinitely via `attempts.strokes`; the exported PNG and source photos are disposable once marking/lesson generation has run. 30 days leaves a window to debug a disputed mark against the original image before it's gone. Scheduled deletion job, not per-request.

### 10.4 Submission flows

**Typed:**
1. Normalise and compare locally (§9). Correct → instant tick, no network call to a model.
2. Near miss → adjudicate per §9.3.
3. Wrong → show verdict, then offer **Explain** (Haiku), **Hint** and **Show solution** (both from stored fields, free).

**Handwritten:**
1. Render PNG, upload to blob storage, POST to `/api/mark` **with the question ID**.
2. Server loads `question_text`, `canonical_answer` and `worked_solution` and passes them to Sonnet with the image. Claude marks against a known answer rather than solving from scratch.
3. Response streams back; attempt row written.
4. UI renders **in this order**:
   - **"I read your working as: …"** transcription
   - a **"That's not what I wrote"** button
   - verdict badge
   - location of first error
   - then, gated by mode, hint / solution

**Transcription-first display is the most important UX element in this app.** Vision models occasionally misread handwritten maths. Showing what Claude *read* before the verdict turns a misread into a correction rather than a wrong mark and a loss of trust. When `transcription_confidence` is `low`, prompt to rewrite more clearly rather than delivering a confident verdict.

"That's not what I wrote" opens a text box to type the correct working, and re-marks from text.

### 10.5 Ask Claude panel

Collapsed by default. Thread is **scoped to the current lesson and question**, with lesson content and last attempt in context, so "I don't understand this" works without re-explaining. Threads persist and reopen.

### 10.6 Review queue

- Every `incorrect` or `partially_correct` attempt writes a `review_items` row tagged with topic, storing the question and canonical answer.
- On app open, if items are due, offer a **warm-up: 3–5 questions from past errors**, answered normally.
- SM-2-style scheduling: correct → interval grows; incorrect → resets.
- This automates the retrieval-practice warm-up step of the existing study routine, and is the main reason the database earns its place.

---

## 11. Data model

Auth.js's Drizzle adapter creates `users`, `accounts`, `sessions`, `verification_tokens`.

```
topics                        -- seeded from the 35-lesson scheme
  id, strand, unit_number, lesson_number, name, description,
  prerequisites jsonb

lessons
  id, user_id, topic_id (nullable),
  source_type       text,    -- scheme | typed | photo
  source_prompt     text,    -- nullable
  source_image_key  text,    -- nullable
  title, content jsonb,      -- {explanation, worked_examples[], key_facts[]}
  status, created_at, completed_at

questions
  id, lesson_id, position,
  question_text     text,    -- LaTeX
  answer_type       text,    -- numeric | fraction | expression | ratio | text | multi
  canonical_answer  text,
  accepted_forms    jsonb,
  tolerance         numeric, -- nullable
  units             text,    -- nullable
  preferred_input   text,    -- typed | handwritten
  worked_solution   text,
  hint              text,
  difficulty        text,    -- easy | standard | stretch
  flagged_bad       boolean,
  created_at

attempts
  id, user_id, question_id,
  input_mode        text,    -- typed | handwritten
  typed_answer      text,    -- nullable
  strokes           jsonb,   -- nullable
  answer_image_key  text,    -- nullable
  checked_locally   boolean, -- true = no model call; false covers both handwriting marking and near-miss Haiku adjudication (§9.3)
  response_mode     text,
  transcription     text,    -- nullable (handwritten only)
  transcription_confidence text,
  verdict           text,    -- correct | partially_correct | incorrect | unclear
  feedback          jsonb,
  model             text,    -- nullable when checked_locally
  tokens_in, tokens_out,
  created_at

threads
  id, user_id, lesson_id, question_id (nullable), created_at

messages
  id, thread_id, role, content, image_keys jsonb, created_at

review_items
  id, user_id, topic_id, source_attempt_id,
  prompt_text, canonical_answer,
  interval_days, ease, due_at, last_reviewed_at, status

user_progress
  user_id, topic_id, status, attempts_count, accuracy, completed_at
```

---

## 12. Claude integration

### 12.1 Lesson generation (Haiku)

- Role: teaching UK Year 7 (KS3) maths to an **adult relearner** — right level, not childish.
- British conventions and vocabulary (BIDMAS, "simplify", metric units, £).
- Explanation, then two or three worked examples of increasing difficulty.
- Output maths as LaTeX for KaTeX.
- From a photo: identify topic and question style, then **generate original content** — do not transcribe the page.

### 12.2 Question generation (Sonnet)

- Generate a batch at a stated difficulty for a stated topic.
- **For each question produce: question text, `answer_type`, canonical answer, `accepted_forms`, tolerance, units, `preferred_input`, worked solution, and a single-nudge hint — in the same response.** This is what makes both local checking and later marking reliable.
- Answers must be unambiguous and checkable; avoid multiple valid interpretations.
- `accepted_forms` should list every reasonable equivalent the user might type.
- Vary contexts and numbers rather than repeating a template.
- **Self-check:** work each question independently before returning it; discard any whose answer cannot be confirmed.

### 12.3 Marking (Sonnet)

- Inputs: question text, canonical answer, worked solution, handwriting image.
- **Transcribe first, judge second.** Never assume an unclear symbol; flag it.
- Identify the **first** error, not its downstream consequences.
- Correct method with an arithmetic slip → `partially_correct`.
- Correct answer via a different valid method → `correct`. Do not penalise divergence from the stored solution.
- **`method_note` must describe *what* went wrong at the first error, never the correct method or answer.** It is returned regardless of `response_mode` — hint/solution are gated client-side from stored fields (§5.4), but this call isn't, so it must not leak beyond what `mark_only` promises.
- Return only JSON.

```json
{
  "transcription": "string — the handwriting in plain maths notation",
  "transcription_confidence": "high | medium | low",
  "unclear_symbols": ["string"],
  "verdict": "correct | partially_correct | incorrect | unclear",
  "first_error": { "at_step": "string", "what_went_wrong": "string" },
  "method_note": "string, nullable"
}
```

Hint and solution come from the stored `questions` row, not this call. Strip code fences defensively before parsing.

### 12.4 Operational notes

- **The API key lives server-side only.** Never ship it to the client.
- **Stream every generation endpoint.** Vision + reasoning can exceed Netlify's default synchronous function timeout — verify the current limit for the plan in use and confirm streaming works end-to-end early in Phase 1.
- Downscale images before sending; oversized images cost tokens without improving accuracy.
- Enable **prompt caching** on the system prompts and lesson context.
- Log `model`, `tokens_in`, `tokens_out` per call.
- Per-user rate limit as a runaway-cost guard.

---

## 13. Cost model

The API is **not** covered by a Claude.ai subscription — it is separate, usage-based billing requiring credits added at console.anthropic.com. (The Claude Code usage involved in *building* this app is covered by a Pro/Max subscription; the app's runtime calls are not.)

⚠️ **Gotcha:** if `ANTHROPIC_API_KEY` is exported in your shell, Claude Code bills at API rates and ignores the subscription. Keep the key in `.env.local` only, never in a shell profile.

**Rates (August 2026, verify before launch):** Haiku 4.5 $1/$5 per million input/output tokens; Sonnet 5 $2/$10 through 31 August 2026, then $3/$15. Batch API is 50% off; cache hits cost 10% of base input.

**Estimated steady-state usage** — 3 sessions/week, ~15 questions each, roughly half typed:

| Task | Calls/month | Est. cost |
|---|---|---|
| Lesson generation (Haiku) | ~12 | ~$0.10 |
| Question + answer generation (Sonnet) | ~24 batches | ~$1.00 |
| Typed answer checks (local, no call) | ~90 | **$0.00** |
| Typed near-miss adjudication (Haiku, rare) | ~5 | ~$0.01 |
| Handwriting marking (Sonnet) | ~90 | ~$1.30 |
| Explanations + chat (Haiku) | ~30 | ~$0.15 |
| **Total** | | **~$2.50–4.00/month** |

**Budget ~$20 of credits and set a spend cap in the Console.** Development and testing will cost more than a month of real use — expect most spend in the first fortnight.

Cost dashboard in Phase 3 should report tokens and spend per task type, so the routing assumptions can be checked against reality.

---

## 14. Auth

- Auth.js v5, Google provider only.
- **Allowlist a single email address** in the `signIn` callback. This is a personal tool; open sign-up is a bill waiting to happen.
- All API routes check the session and scope every query by `user_id`.

---

## 15. Environment variables

```
ANTHROPIC_API_KEY
ANTHROPIC_MODEL_FAST         # Haiku model ID
ANTHROPIC_MODEL_CAPABLE      # Sonnet model ID
DATABASE_URL                 # Neon pooled connection string
AUTH_SECRET
AUTH_GOOGLE_ID
AUTH_GOOGLE_SECRET
AUTH_URL
ALLOWED_EMAIL
BLOB_*
```

---

## 16. Phased delivery

### Phase 1 — Prove the hard part (no auth, no database)

State in React and localStorage.

- [ ] Next.js app scaffolded, running locally and deployed to Netlify
- [ ] Lesson panel: type a topic → streamed lesson rendered with KaTeX (Haiku)
- [ ] Question generation returning full answer metadata per §12.2 (Sonnet)
- [ ] **Typed answer input (MathLive) with local checking and near-miss handling per §9**
- [ ] Whiteboard: Apple Pencil with pressure, palm rejection, undo/redo/clear, crisp on Retina
- [ ] Draggable split divider; iPad landscape layout
- [ ] Submit handwritten → `/api/mark` with known question and answer → streamed response
- [ ] Transcription-first display with verdict and "That's not what I wrote"
- [ ] Response mode selector and progressive reveal of hint/solution

**Acceptance:**
1. Ten handwritten answers marked correctly on a physical iPad, including two deliberate errors located accurately, with no false "incorrect" from an uncaught misread.
2. Twenty generated questions hand-checked — at least nineteen have correct, unambiguous canonical answers.
3. **Typed checking tested against thirty equivalent-form inputs** (`1/2`, `0.5`, `50%`, `2/4`, `½`, `0.50`, wrong units, unsimplified fractions) with no false rejections.

### Phase 2 — Persistence and photo input

- [ ] Google login via Auth.js, single-email allowlist
- [ ] Neon + Drizzle schema and migrations; `topics` seeded with the 35-lesson scheme
- [ ] Lessons and questions persisted; resume where you left off
- [ ] **Photo input**: camera capture → topic identification → generated lesson
- [ ] Lesson controls (explain differently, more examples, harder/easier, flag question)
- [ ] Attempts persisted with strokes, images, verdict; replayable stroke history
- [ ] Ask Claude panel with persisted, lesson-scoped threads
- [ ] Progress tracking against the 35-lesson scheme

**Acceptance:** close the app mid-lesson, reopen on a different device, land on the same question with history intact.

### Phase 3 — The learning loop

- [ ] `review_items` written on every non-correct attempt
- [ ] Due-items warm-up on app open
- [ ] SM-2-style scheduling
- [ ] PWA: manifest, service worker, Add to Home Screen, fullscreen
- [ ] Portrait layout
- [ ] Cost dashboard (tokens and spend by task type)
- [ ] Accuracy-by-topic view to expose weak strands
- [ ] Scheduled job to delete blob images older than 30 days (§10.3)

**Acceptance:** a session opens with a warm-up drawn from genuine past errors, without manual curation.

---

## 17. Risks and open questions

| Risk | Mitigation |
|---|---|
| **Local checker rejects valid equivalent answers** | mathjs symbolic comparison; `accepted_forms`; near-miss escalation (§9.3); 30-input acceptance test |
| **Generated questions contain errors** | Generate answer + solution together with self-verification; "flag question" button; hand-check a sample in Phase 1 |
| No fixed authoritative question set | Seeded scheme keeps coverage systematic; Corbettmaths / Dr Frost / Maths Genie remain available on paper for cross-checking |
| Vision misreads handwriting | Transcription-first display; confidence flag; manual correction path; Sonnet not Haiku |
| Netlify function timeout on long calls | Streaming, verified in Phase 1 before anything is built on it |
| Serverless DB connection exhaustion | Neon HTTP driver, no TCP pooling |
| API cost runaway | Local checking, image downscaling, prompt caching, rate limit, spend cap in Console |
| Typed input makes it too easy to guess | `mark_only` default; one attempt before hint is offered; review queue catches persistent gaps |
| App makes learning too easy generally | Handwriting always available and never discouraged; deliberate escalation only |

**Open questions:**

1. Should the app enforce handwriting on `preferred_input: handwritten` questions, or always allow typing?
2. Should generated lessons be cached and reused across sessions, or regenerated on request? (Currently: persisted per lesson, regenerate on request.)
3. Infinite-scroll whiteboard, or fixed-height canvas with "new page"?
4. Should a photographed page generate questions *matched to the specific questions on that page*, so paper practice can be marked here?

---

## 18. Handover notes for Claude Code

Create a `CLAUDE.md` at the repo root containing:

- The stack table (§7) and model routing table (§8).
- **The Anthropic API key must never reach the client.**
- **Typed answers are checked locally with no model call in the common case.** This is a hard architectural rule, not an optimisation — see §9. The one deliberate exception is near-miss adjudication (§9.3): a single Haiku call, used only when local comparison can't determine equivalence. Do not "fix" that call away thinking it violates the rule, and do not let it grow into a general-purpose checker.
- The Neon rule: **serverless HTTP driver only**.
- Whiteboard rules from §10.3 (Pointer Events, `devicePixelRatio`, vector strokes) — easy to get wrong, expensive to retrofit.
- **Questions are always generated together with full answer metadata** (§12.2) — both local checking and marking depend on it.
- The marking response schema (§12.3) as the server/client contract.
- Model IDs come from environment config, never hardcoded.
- Work **phase by phase**, meeting each phase's acceptance criteria on a physical iPad before starting the next.

Build Phase 1 in this order: scaffold → lesson generation + KaTeX → question generation with answer metadata → **typed input and local checker** → whiteboard → streaming mark route → marking UI.

Build the local checker before the whiteboard. It is cheaper to test, it exercises the question-generation contract end to end, and it will surface any weakness in the generated answer metadata early — while that is still cheap to fix.
