# TermShift

[Live demo](https://termshift.vercel.app)

TermShift helps Northeastern CS students decide when a co-op or internship actually fits. Upload an unofficial transcript, import a job posting, and the planner shows how that work term moves remaining courses and graduation.

This repo is the product plus a small applied-AI layer: retrieve the document, extract a schema-validated record, then plan against a seeded Northeastern BSCS software-concentration model.

## Problem

Universities now treat semester-long work as a normal part of a degree, but the operational question is still hard:

- Which courses do I already have?
- Which intern/co-op terms am I actually eligible for?
- If I take this role, what happens to graduation?

TermShift answers that locally in the browser, with a planner that already exists, plus structured extraction so a pasted job URL or transcript PDF becomes planner state instead of a pile of text.

## Architecture

```text
parse          extract                         plan
PDF / HTML  -> schema-validated JSON        -> degree-path model
               (gpt-4o-mini or heuristic)
```

1. **Parse (retrieve).** Transcript PDFs are read in the browser with `pdfjs-dist` so text extraction never hits a server-side PDF build. Job URLs are fetched by `/api/parse-job-url`, which still uses HTML, Open Graph, and JSON-LD as the retrieval step.
2. **Extract (structure).** Server routes turn that text into JSON:
   - Jobs: title, company, location, term window, focus areas, preferred catalog courses.
   - Transcripts / degree audits: school, program, completed courses, in-progress courses, remaining requirements.
   Extraction uses OpenAI `gpt-4o-mini` through the Vercel AI SDK (`generateObject` + Zod). If `OPENAI_API_KEY` is missing or the model call fails, the same routes fall back to the local heuristic parser, tell the UI that happened, and never crash.
3. **Plan.** Extracted courses map onto the seeded Northeastern BSCS software concentration catalog. Imported jobs become work-term / internship blocks you can test against the current plan.

The current curriculum model is Northeastern BSCS (software concentration) only. Columbia appears in onboarding and demo materials, but degree-path math stays on the Northeastern catalog.

## What “good extraction” means here

This is not a chatbot wrapper. The AI piece is constrained structured output:

- Zod schemas for job postings and transcripts
- Catalog-aware course IDs (`cs3650`, `softwareB`, …) instead of free-text guesses
- Valid academic term IDs (`2027-summer2`, `2027-fall`, …)
- Deterministic fallback so the product works without a key
- An eval suite that scores field accuracy without calling a model

## Evals

`npm run eval` scores the heuristic fallback against goldens. It does **not** need `OPENAI_API_KEY`.

Fixtures:

- Transcript text taken from the two demo PDFs in `public/demo-transcripts/`
- Four saved job-posting HTML samples (Amazon Robotics, NVIDIA Dynamo, Zipline, Notion)

The runner reports per-field accuracy plus precision/recall on set fields (courses, focus areas, remaining requirements). Live `gpt-4o-mini` cases stay off unless you opt in later with a key; this repo’s default eval is the offline suite.

## Setup

```bash
npm install
cp .env.example .env.local   # optional; extraction works without a key
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run eval     # heuristic field-accuracy against goldens
npm run build    # production build
```

### Environment

| Variable | Where | Required |
| --- | --- | --- |
| `OPENAI_API_KEY` | `.env.local` or Vercel project env | No. When unset, routes use the local parser and the UI says so. |

Never commit a real key. `.env*` is gitignored; `.env.example` is the template.

Model: `gpt-4o-mini` via `@ai-sdk/openai`.

## Using the app

1. Enter name, school, and major.
2. Upload an unofficial transcript / degree audit, or use the Northeastern example audit.
3. Review the plan, then search work terms.
4. Paste a public job URL under **Try Any Role**. TermShift fetches the page, extracts a structured listing, and lets you test it on the timeline.

Demo PDFs:

- `public/demo-transcripts/caroline-hughes-northeastern-unofficial-transcript.pdf`
- `public/demo-transcripts/jane-doe-columbia-msai-degree-audit.pdf`

## Stack

- Next.js 16 App Router, React 19
- Client-side PDF text extraction (`pdfjs-dist`)
- Vercel AI SDK + Zod for schema-validated LLM extraction
- Local heuristic parsers as the no-key fallback
- Planner state persisted in `localStorage`

## Project layout

```text
src/app/api/parse-job-url/      fetch HTML, then extract a job
src/app/api/parse-transcript/   extract a planner profile from text
src/lib/extract/                schemas, OpenAI wrapper, heuristic + merge
src/lib/pathwise-planner.ts     existing Northeastern planner
evals/                          goldens, fixtures, field-accuracy runner
```
