import {
	COURSE_REQUIREMENTS,
	DEMO_PROFILES,
	getTermIndex,
} from "@/lib/pathwise-data";
import {
	catalogPromptBlock,
	mapCourseCodeToId,
	uniqueIds,
} from "@/lib/extract/catalog";
import { buildTranscriptExtractionNote } from "@/lib/extract/notes";
import { generateStructured, hasOpenAIKey } from "@/lib/extract/openai";
import { transcriptExtractionSchema } from "@/lib/extract/schemas";
import { extractTranscriptHeuristically } from "@/lib/extract/transcript-heuristic";
import { truncateText } from "@/lib/extract/html";
import type {
	ExtractedCourse,
	ExtractionFallbackReason,
	ExtractionSource,
	TranscriptExtraction,
	TranscriptExtractionResult,
} from "@/lib/extract/types";
import type { StudentProfile } from "@/lib/pathwise-types";

const MIN_MAPPED_COMPLETED = 8;

function cleanCourses(courses: ExtractedCourse[] | undefined) {
	return (courses ?? [])
		.map((course) => ({
			code: course.code.trim(),
			grade: course.grade?.trim() || undefined,
			term: course.term?.trim() || undefined,
			title: course.title?.trim() || "",
		}))
		.filter((course) => course.code);
}

function mergeTranscriptExtractions(
	heuristic: TranscriptExtraction,
	llm: TranscriptExtraction,
): TranscriptExtraction {
	const llmCompleted = cleanCourses(llm.completedCourses);
	const llmInProgress = cleanCourses(llm.inProgressCourses);
	const llmRemaining = (llm.remainingRequirements ?? [])
		.map((item) => item.trim())
		.filter(Boolean);

	return {
		completedCourses:
			llmCompleted.length > 0 ? llmCompleted : heuristic.completedCourses,
		expectedGraduation:
			llm.expectedGraduation.trim() || heuristic.expectedGraduation,
		inProgressCourses:
			llmInProgress.length > 0 ? llmInProgress : heuristic.inProgressCourses,
		program: llm.program.trim() || heuristic.program,
		remainingRequirements:
			llmRemaining.length > 0 ? llmRemaining : heuristic.remainingRequirements,
		school: llm.school.trim() || heuristic.school,
		startYear: llm.startYear || heuristic.startYear,
		studentName: llm.studentName.trim() || heuristic.studentName,
	};
}

function termLabelToId(label: string) {
	const match = label.match(
		/\b(fall|spring|summer\s*1|summer\s*2|summer|winter)\s+(20\d{2})\b/i,
	);
	if (!match) return null;

	const year = match[2];
	const season = match[1].toLowerCase().replace(/\s+/g, "");

	if (season === "fall") return `${year}-fall`;
	if (season === "spring" || season === "winter") return `${year}-spring`;
	if (season === "summer1") return `${year}-summer1`;
	if (season === "summer2" || season === "summer") return `${year}-summer2`;
	return null;
}

function inferLockedThroughTermId(extraction: TranscriptExtraction) {
	const inProgressTermIds = extraction.inProgressCourses
		.map((course) => (course.term ? termLabelToId(course.term) : null))
		.filter((termId): termId is string => Boolean(termId));

	if (inProgressTermIds.length > 0) {
		return inProgressTermIds.sort(
			(left, right) => getTermIndex(right) - getTermIndex(left),
		)[0];
	}

	const completedTermIds = extraction.completedCourses
		.map((course) => (course.term ? termLabelToId(course.term) : null))
		.filter((termId): termId is string => Boolean(termId));

	if (completedTermIds.length > 0) {
		return completedTermIds.sort(
			(left, right) => getTermIndex(right) - getTermIndex(left),
		)[0];
	}

	return DEMO_PROFILES.sophomore.lockedThroughTermId;
}

function catalogRemaining(completedIds: string[], inProgressIds: string[]) {
	const taken = new Set([...completedIds, ...inProgressIds]);
	return COURSE_REQUIREMENTS.filter((course) => !taken.has(course.id)).map(
		(course) => course.code,
	);
}

function isNortheastern(school: string) {
	return /northeastern/i.test(school);
}

export function studentProfileFromExtraction(
	extraction: TranscriptExtraction,
	fileName: string,
	source: ExtractionSource,
	fallbackReason: ExtractionFallbackReason,
): StudentProfile {
	const completedCourseIds = uniqueIds(
		extraction.completedCourses.map((course) => mapCourseCodeToId(course.code)),
	);
	const inProgressCourseIds = uniqueIds(
		extraction.inProgressCourses
			.map((course) => mapCourseCodeToId(course.code))
			.filter((id) => id && !completedCourseIds.includes(id)),
	);
	const school = extraction.school || DEMO_PROFILES.sophomore.school;
	const northeasternMapped =
		isNortheastern(school) && completedCourseIds.length >= MIN_MAPPED_COMPLETED;
	const remainingRequirements = northeasternMapped
		? catalogRemaining(completedCourseIds, inProgressCourseIds)
		: extraction.remainingRequirements;
	const details = northeasternMapped
		? `Extracted ${completedCourseIds.length} completed and ${inProgressCourseIds.length} in-progress courses from the unofficial transcript, then mapped them onto the Northeastern BSCS software concentration planner.`
		: `Extracted school, course, and remaining-requirement fields from the upload. Degree-path modeling in this MVP is still seeded to Northeastern CS requirements.`;

	const seed = DEMO_PROFILES.sophomore;
	const profileCore = northeasternMapped
		? {
				id: "extracted-northeastern-bscs",
				label: `${extraction.studentName || "Student"} · academic snapshot`,
				school: "Northeastern University",
				program:
					extraction.program || "B.S. in Computer Science",
				startYear: extraction.startYear || seed.startYear,
				targetGraduation:
					extraction.expectedGraduation || seed.targetGraduation,
				openToGraduation: seed.openToGraduation,
				lockedThroughTermId: inferLockedThroughTermId(extraction),
				completedCourseIds,
				inProgressCourseIds,
			}
		: {
				...seed,
				school,
				program: extraction.program || seed.program,
				label: `${extraction.studentName || "Student"} · academic snapshot`,
			};

	return {
		...profileCore,
		uploadedAt: new Date().toISOString(),
		uploadedFileName: fileName,
		parserNote: buildTranscriptExtractionNote(
			details,
			source,
			fallbackReason,
		),
		extractionSource: source,
		remainingRequirements,
	};
}

async function extractTranscriptWithLlm(text: string) {
	return generateStructured(transcriptExtractionSchema, {
		system: [
			"You extract structured academic records from unofficial transcripts and degree audits.",
			"Use only evidence in the document. Do not invent courses.",
			"Completed courses have letter grades. In-progress courses are marked IP or listed under current registration / courses in progress.",
			"Do not treat future registration (RG) as in-progress; put those codes in remainingRequirements.",
			"When a Northeastern code matches this catalog, keep the catalog spelling including slash labs:",
			catalogPromptBlock(),
		].join("\n"),
		prompt: `Extract the academic document into the schema.\n\n${truncateText(text, 18_000)}`,
	});
}

export async function extractTranscriptProfile(
	text: string,
	fileName: string,
): Promise<TranscriptExtractionResult> {
	const heuristic = extractTranscriptHeuristically(text, fileName);
	let extraction = heuristic;
	let extractionSource: ExtractionSource = "heuristic";
	let fallbackReason: ExtractionFallbackReason = "no-key";

	if (hasOpenAIKey()) {
		try {
			const llm = await extractTranscriptWithLlm(text);
			extraction = mergeTranscriptExtractions(heuristic, {
				completedCourses: llm.completedCourses,
				expectedGraduation: llm.expectedGraduation,
				inProgressCourses: llm.inProgressCourses,
				program: llm.program,
				remainingRequirements: llm.remainingRequirements,
				school: llm.school,
				startYear: llm.startYear,
				studentName: llm.studentName,
			});
			extractionSource = "llm";
			fallbackReason = null;
		} catch {
			fallbackReason = "llm-error";
		}
	}

	const profile = studentProfileFromExtraction(
		extraction,
		fileName,
		extractionSource,
		fallbackReason,
	);

	return {
		extractionNote: profile.parserNote,
		extractionSource,
		profile,
		remainingRequirements: profile.remainingRequirements ?? [],
	};
}

export function extractTranscriptProfileHeuristically(
	text: string,
	fileName: string,
) {
	const extraction = extractTranscriptHeuristically(text, fileName);
	const profile = studentProfileFromExtraction(
		extraction,
		fileName,
		"heuristic",
		"no-key",
	);

	return {
		extraction,
		extractionNote: profile.parserNote,
		extractionSource: "heuristic" as const,
		profile,
		remainingRequirements: profile.remainingRequirements ?? [],
	};
}
