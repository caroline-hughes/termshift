# TermShift

[Live demo](https://termshift.vercel.app)

TermShift helps Northeastern CS students decide when a co-op or internship actually fits. Upload an unofficial transcript, import a job posting, and the planner shows how that work term moves remaining courses and graduation.

This repo is the product plus a small applied-AI layer: retrieve the document, extract a schema-validated record, plan against a seeded Northeastern BSCS software-concentration model, then optionally explain the deterministic Plan Insights in plain language.

## Problem

Universities now treat semester-long work as a normal part of a degree, but the operational question is still hard:

- Which courses do I already have?
- Which intern/co-op terms am I actually eligible for?
- If I take this role, what happens to graduation?

TermShift answers that locally in the browser, with a planner that already exists, plus structured extraction so a pasted job URL or transcript PDF becomes planner state instead of a pile of text.

## Architecture

```text
parse          extract                         plan                         explain
PDF / HTML  -> schema-validated JSON        -> degree-path model         -> optional Plan Coach
               (gpt-4o-mini or heuristic)      (deterministic insights      (gpt-4o-mini narrative
                                                + auto-apply)                only)
```

Hybrid split:

- **LLM for unstructured input** (and an optional coach blurb). Jobs and transcripts become Zod-validated JSON. Plan Coach restates existing Plan Insights in 2–4 sentences. It does not invent moves and it does not replace auto-apply.
- **Deterministic planner for academic constraints.** Prerequisite order, term load, internship load, timeline shift, ENGW-during-coop, and horizon limits come from `buildPlanAssessment`. The ✨ fix buttons simulate planner moves. Those stay rule-based even when a key is present.

1. **Parse (retrieve).** Transcript PDFs are read in the browser with `pdfjs-dist` so text extraction never hits a server-side PDF build. Job URLs are fetched by `/api/parse-job-url`, which still uses HTML, Open Graph, and JSON-LD as the retrieval step.
2. **Extract (structure).** Server routes turn that text into JSON:
   - Jobs: title, company, location, term window, focus areas, preferred catalog courses.
   - Transcripts / degree audits: school, program, completed courses, in-progress courses, remaining requirements.
   Extraction uses OpenAI `gpt-4o-mini` through the Vercel AI SDK (`generateObject` + Zod). If `OPENAI_API_KEY` is missing or the model call fails, the same routes fall back to the local heuristic parser, tell the UI that happened, and never crash.
3. **Plan.** Extracted courses map onto the seeded Northeastern BSCS software concentration catalog. Imported jobs become work-term / internship blocks you can test against the current plan. Plan Insights and auto-apply stay deterministic.
4. **Explain (optional).** `/api/plan-coach` sends the already-computed assessment plus light planner context (projected graduation, experiment mode, selected company/block). If the key is missing or the call fails, the rail looks exactly like today.

The current curriculum model is Northeastern BSCS (software concentration) only. Columbia appears in onboarding and demo materials, but degree-path math stays on the Northeastern catalog.

## What “good extraction” means here

This is not a chatbot wrapper. The AI piece is constrained structured output:

- Zod schemas for job postings and transcripts
- Catalog-aware course IDs (`cs3650`, `softwareB`, …) instead of free-text guesses
- Valid academic term IDs (`2027-summer2`, `2027-fall`, …)
- Deterministic fallback so the product works without a key
- An eval suite that scores field accuracy without calling a model
- An optional Plan Coach schema that can only narrate findings the planner already produced

## End-to-end demo

1. Open the [live demo](https://termshift.vercel.app) or `npm run dev`.
2. Enter a name, choose **Northeastern University** / **BS CS**, and load the Northeastern example audit (`public/demo-transcripts/caroline-hughes-northeastern-unofficial-transcript.pdf`).
3. Review the plan, then open work-term search. Under **Try Any Role**, paste a public job URL (Indeed/LinkedIn/company page). `/api/parse-job-url` fetches the page and extracts a structured listing with `gpt-4o-mini`, or the local heuristic if there is no key.
4. Test the imported role on the timeline. The planner inserts a work-term or internship block and rebuilds remaining coursework.
5. Read **Plan Insights** in the rail (prerequisite order, overload/underload, internship load, timeline shift, and so on).
6. Hover an insight with a ✨ button and auto-apply a suggested fix. That action is still a deterministic planner move.
7. If `OPENAI_API_KEY` is set, a **Plan coach** blurb appears under the insights and explains those findings. If the key is missing or the call fails, the blurb is omitted and insights stay as they are.

Seeded listings also work if you do not want to paste a live URL. Demo PDFs:

- `public/demo-transcripts/caroline-hughes-northeastern-unofficial-transcript.pdf`
- `public/demo-transcripts/jane-doe-columbia-msai-degree-audit.pdf`

## Evals

`npm run eval` scores the heuristic fallback against goldens and checks OpenAI-strict schemas plus the Plan Coach prompt builder. It does **not** need `OPENAI_API_KEY`.

Fixtures:

- Transcript text taken from the two demo PDFs in `public/demo-transcripts/`
- Four saved job-posting HTML samples (Amazon Robotics, NVIDIA Dynamo, Zipline, Notion)

The runner reports per-field accuracy plus precision/recall on set fields (courses, focus areas, remaining requirements). Live `gpt-4o-mini` cases stay off unless you opt in later with a key; this repo’s default eval is the offline suite.

## Setup

```bash
npm install
cp .env.example .env.local   # optional; extraction and Plan Coach work without a key
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run eval     # heuristic field-accuracy against goldens (no live LLM)
npm run build    # production build
```

### Environment

| Variable | Where | Required |
| --- | --- | --- |
| `OPENAI_API_KEY` | `.env.local` or Vercel project env | No. When unset, job/transcript routes use the local parser and Plan Coach omits the blurb. |

Never commit a real key. `.env*` is gitignored; `.env.example` is the template.

Model: `gpt-4o-mini` via `@ai-sdk/openai`. Plan Coach uses the same key and the same `generateStructured` helper. A missing key or a failed coach call never blocks the planner.

## Using the app

1. Enter name, school, and major.
2. Upload an unofficial transcript / degree audit, or use the Northeastern example audit.
3. Review the plan, then search work terms.
4. Paste a public job URL under **Try Any Role**. TermShift fetches the page, extracts a structured listing, and lets you test it on the timeline.
5. Use Plan Insights to inspect issues, auto-apply a fix when one is offered, and (optionally) read the Plan Coach explanation.

## Stack

- Next.js 16 App Router, React 19
- Client-side PDF text extraction (`pdfjs-dist`)
- Vercel AI SDK + Zod for schema-validated LLM extraction and optional Plan Coach
- Local heuristic parsers as the no-key fallback
- Deterministic planner, Plan Insights, and auto-apply
- Planner state persisted in `localStorage`

## Project layout

```text
src/app/api/parse-job-url/           fetch HTML, then extract a job
src/app/api/parse-transcript/        extract a planner profile from text
src/app/api/plan-coach/              optional LLM explanation of Plan Insights
src/lib/extract/                     schemas, OpenAI wrapper, heuristic + merge
src/lib/extract/plan-coach.ts        coach request + prompt builder
src/lib/termshift-plan-assessment.ts deterministic Plan Insights
src/lib/pathwise-planner.ts          existing Northeastern planner
evals/                               goldens, fixtures, field-accuracy runner
```

## Resume copy

Paste-ready bullets:

- Built a Next.js degree-path planner that turns unofficial transcripts and job postings into Zod-validated records with OpenAI `gpt-4o-mini` (Vercel AI SDK structured outputs), a catalog-aware heuristic fallback, and offline field-accuracy evals so the product works without an API key.
- Kept academic constraints in a deterministic Northeastern BSCS planner (prereqs, term load, co-op windows, graduation shift) with rule-based auto-apply, then added an optional LLM Plan Coach that only narrates those findings and fails soft when the key is missing.
- Shipped a hybrid applied-AI architecture: LLM for unstructured extraction plus optional coach narrative; deterministic planning, insights, and auto-apply for degree-path math.

Architecture one-liner:

> Hybrid academic planner: `gpt-4o-mini` extracts jobs and transcripts into Zod schemas (heuristic fallback + evals), then a deterministic degree-path engine owns Plan Insights and auto-apply, with an optional LLM coach that explains those findings without inventing new actions.
