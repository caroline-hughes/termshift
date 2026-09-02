import {
	COURSE_ID_SET,
	TERM_ID_SET,
	catalogPromptBlock,
	termPromptBlock,
	uniqueIds,
} from "@/lib/extract/catalog";
import {
	extractJobFromHtml,
	toReadableJobText,
} from "@/lib/extract/job-heuristic";
import { buildJobExtractionNote } from "@/lib/extract/notes";
import {
	generateStructured,
	hasOpenAIKey,
	recordExtractionFailure,
} from "@/lib/extract/openai";
import { jobExtractionSchema, type JobExtraction } from "@/lib/extract/schemas";
import type {
	ExtractionFallbackReason,
	JobExtractionResult,
} from "@/lib/extract/types";
import type { WorkOpportunity } from "@/lib/termshift-opportunities";

function cleanString(value: string | null | undefined, fallback: string) {
	const trimmed = value?.trim() ?? "";
	return trimmed ? trimmed : fallback;
}

function mergeJobExtraction(
	heuristic: WorkOpportunity,
	llm: JobExtraction,
): WorkOpportunity {
	const preferredCourseIds = uniqueIds(
		(llm.preferredCourseIds ?? [])
			.map((id) => id.trim())
			.filter((id) => COURSE_ID_SET.has(id)),
	);
	const termStartId = TERM_ID_SET.has(llm.termStartId)
		? llm.termStartId
		: heuristic.termStartId;
	const termEndId = TERM_ID_SET.has(llm.termEndId)
		? llm.termEndId
		: heuristic.termEndId;
	const focusAreas = (llm.focusAreas ?? [])
		.map((area) => area.trim())
		.filter(Boolean)
		.slice(0, 3);
	const compensation =
		llm.compensation?.trim() || heuristic.compensation || undefined;

	return {
		...heuristic,
		blockType: llm.blockType || heuristic.blockType,
		company: cleanString(llm.company, heuristic.company),
		compensation,
		focusAreas: focusAreas.length > 0 ? focusAreas : heuristic.focusAreas,
		location: cleanString(llm.location, heuristic.location),
		preferredCourseIds:
			preferredCourseIds.length > 0
				? preferredCourseIds.slice(0, 4)
				: heuristic.preferredCourseIds,
		summary: cleanString(llm.summary, heuristic.summary).slice(0, 280),
		termEndId,
		termLabel: cleanString(llm.termLabel, heuristic.termLabel),
		termStartId,
		title: cleanString(llm.title, heuristic.title),
	};
}

async function extractJobWithLlm(html: string): Promise<JobExtraction> {
	const readable = toReadableJobText(html);

	return generateStructured(jobExtractionSchema, {
		system: [
			"You extract structured fields from intern, co-op, and new-grad job postings.",
			"Use only evidence in the posting. Do not invent a company, title, or location.",
			"blockType is work-term when the posting is a co-op or academic work term; otherwise internship.",
			"preferredCourseIds must come from this Northeastern BSCS catalog:",
			catalogPromptBlock(),
			"termStartId and termEndId must come from this list:",
			termPromptBlock(),
			"Six-month July-December roles usually start at {year}-summer2 and end at {year}-fall.",
			"Six-month January-June roles usually start at {year}-spring and end at {year}-summer1.",
		].join("\n"),
		prompt: `Extract the job posting into the schema.\n\n${readable}`,
	});
}

export async function extractJobOpportunity(
	html: string,
	sourceUrl: string,
): Promise<JobExtractionResult> {
	const heuristic = extractJobFromHtml(html, sourceUrl);
	let extractionSource: JobExtractionResult["extractionSource"] = "heuristic";
	let fallbackReason: ExtractionFallbackReason = "no-key";
	let failureDetail: string | undefined;
	let opportunity = heuristic;

	if (hasOpenAIKey()) {
		try {
			const llm = await extractJobWithLlm(html);
			opportunity = mergeJobExtraction(heuristic, llm);
			extractionSource = "llm";
			fallbackReason = null;
		} catch (error) {
			fallbackReason = "llm-error";
			failureDetail = recordExtractionFailure(error);
		}
	}

	return {
		extractionNote: buildJobExtractionNote(
			extractionSource,
			fallbackReason,
			failureDetail,
		),
		extractionSource,
		opportunity,
	};
}
