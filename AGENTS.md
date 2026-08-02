<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Maths Whiteboard

Full design doc: [docs/rfd.md](docs/rfd.md). Read it before making architectural changes — this file is a summary, the RFD is the source of truth.

## Stack

| Concern | Choice | Notes |
|---|---|---|
| Framework | Next.js (App Router), TypeScript | Via `@netlify/plugin-nextjs` once deployed |
| Hosting | Netlify | Not yet wired up (Phase 1 is local-only) |
| Auth | Auth.js (NextAuth v5), Google provider | Phase 2 — not built yet |
| Database | Neon Postgres | **Neon serverless HTTP driver**, not a `pg` TCP pool. Phase 2. |
| ORM | Drizzle | Phase 2 |
| Maths rendering | KaTeX | Lesson and question text from LaTeX |
| Maths input | MathLive | Typed answers with a maths keyboard |
| Answer checking | mathjs | Local numeric-substitution equivalence — see RFD §9.2a |
| Whiteboard | Custom canvas, Pointer Events | Not built yet — see RFD §10.3 |
| Blob storage | Netlify Blobs (or Cloudflare R2) | Phase 2. 30-day retention. |
| AI | Anthropic API | Routing below |
| Styling | Tailwind | |

## Model routing

| Task | Model | Why |
|---|---|---|
| Typed answer check (common case) | **None** | Local comparison, no model call |
| Typed near-miss adjudication (rare) | Haiku | The one deliberate exception to "no model call" — see RFD §9.3 |
| Question + answer + solution generation | Sonnet | A wrong canonical answer poisons every downstream mark |
| Handwriting transcription + marking | Sonnet | Not built yet. Never route to Haiku to save money — see RFD §8. |
| Photo → topic identification | Sonnet | Vision. Not built yet. |
| Lesson text generation | Haiku | Explanatory prose |
| Explaining a wrong typed answer | Haiku | Not built yet |
| Ask Claude chat panel | Haiku | Not built yet |

Model IDs come from environment config (`ANTHROPIC_MODEL_FAST`, `ANTHROPIC_MODEL_CAPABLE`), never hardcoded.

## Hard rules

- **The Anthropic API key must never reach the client.** Server-side only, referenced via `process.env.ANTHROPIC_API_KEY` in Route Handlers.
- **Typed answers are checked locally with no model call in the common case.** Not an optimisation — an architectural rule. The single deliberate exception is near-miss adjudication (RFD §9.3): one Haiku call, only when local comparison can't determine equivalence. Don't "fix" that call away, and don't let it grow into a general-purpose checker.
- **Questions are always generated together with full answer metadata** (`answer_type`, `canonical_answer`, `accepted_forms`, `tolerance`, `units`, `preferred_input`, `worked_solution`, `hint`) in the same model response — both local checking and later marking depend on this contract. See RFD §12.2.
- When the whiteboard is built: Pointer Events (not touch events), filter to `pointerType === 'pen'` for palm rejection, scale canvas by `devicePixelRatio`, store strokes as vectors not bitmaps. See RFD §10.3.
- The marking response schema (RFD §12.3) is the server/client contract once `/api/mark` exists. `method_note` must never reveal the correct method or answer — it isn't gated by `response_mode` the way hint/solution are.

## Working phase by phase

Follow the phased delivery in RFD §16. Build Phase 1 in this order: scaffold → lesson generation + KaTeX → question generation with answer metadata → typed input and local checker → whiteboard → streaming mark route → marking UI. Meet each phase's acceptance criteria before starting the next.
