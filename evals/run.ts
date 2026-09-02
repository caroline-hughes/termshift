import { readFileSync } from "node:fs";
import path from "node:path";
import { extractJobFromHtml } from "../src/lib/extract/job-heuristic";
import {
	formatScore,
	mean,
	scalarScore,
	setF1,
} from "../src/lib/extract/metrics";
import { extractTranscriptProfileHeuristically } from "../src/lib/extract/transcript";

type JobGolden = {
	expected: {
		blockType: string;
		company: string;
		compensation: string;
		focusAreas: string[];
		location: string;
		preferredCourseIds: string[];
		termEndId: string;
		termLabel: string;
		termStartId: string;
		title: string;
	};
	id: string;
	sourceUrl: string;
};

type TranscriptGolden = {
	expected: {
		completedCourseCodes: string[];
		expectedGraduation: string;
		inProgressCourseCodes: string[];
		mapped?: {
			completedCourseIds?: string[];
			inProgressCourseIds?: string[];
			lockedThroughTermId?: string;
			school?: string;
			targetGraduation?: string;
		};
		program: string;
		remainingRequirements: string[];
		school: string;
		studentName: string;
	};
	fileName: string;
	id: string;
	textFile: string;
};

type CaseResult = {
	accuracy: number;
	details: string[];
	id: string;
	kind: "job" | "transcript";
};

const ROOT = process.cwd();
const FIXTURES = path.join(ROOT, "evals/fixtures");
const PASS_THRESHOLD = 0.85;

function loadJson<T>(relativePath: string): T {
	return JSON.parse(
		readFileSync(path.join(FIXTURES, relativePath), "utf8"),
	) as T;
}

function scoreJob(golden: JobGolden): CaseResult {
	const html = readFileSync(
		path.join(FIXTURES, "jobs", `${golden.id}.html`),
		"utf8",
	);
	const predicted = extractJobFromHtml(html, golden.sourceUrl);
	const expected = golden.expected;
	const focus = setF1(predicted.focusAreas, expected.focusAreas);
	const courses = setF1(
		predicted.preferredCourseIds,
		expected.preferredCourseIds,
	);
	const fields: Record<string, number> = {
		blockType: scalarScore(predicted.blockType, expected.blockType),
		company: scalarScore(predicted.company, expected.company),
		compensation: scalarScore(
			predicted.compensation ?? "",
			expected.compensation,
		),
		focusAreas: focus.f1,
		location: scalarScore(predicted.location, expected.location),
		preferredCourseIds: courses.f1,
		termEndId: scalarScore(predicted.termEndId, expected.termEndId),
		termLabel: scalarScore(predicted.termLabel, expected.termLabel),
		termStartId: scalarScore(predicted.termStartId, expected.termStartId),
		title: scalarScore(predicted.title, expected.title),
	};
	const accuracy = mean(Object.values(fields));

	return {
		accuracy,
		details: [
			`title=${formatScore(fields.title)}`,
			`company=${formatScore(fields.company)}`,
			`location=${formatScore(fields.location)}`,
			`term=${formatScore(fields.termLabel)}`,
			`focus P=${formatScore(focus.precision)} R=${formatScore(focus.recall)}`,
			`courses P=${formatScore(courses.precision)} R=${formatScore(courses.recall)}`,
		],
		id: golden.id,
		kind: "job",
	};
}

function scoreTranscript(golden: TranscriptGolden): CaseResult {
	const text = readFileSync(
		path.join(FIXTURES, "transcripts", golden.textFile),
		"utf8",
	);
	const result = extractTranscriptProfileHeuristically(text, golden.fileName);
	const expected = golden.expected;
	const completed = setF1(
		result.extraction.completedCourses.map((course) => course.code),
		expected.completedCourseCodes,
	);
	const inProgress = setF1(
		result.extraction.inProgressCourses.map((course) => course.code),
		expected.inProgressCourseCodes,
	);
	const remaining = setF1(
		result.remainingRequirements,
		expected.remainingRequirements,
	);
	const fields: Record<string, number> = {
		completed: completed.f1,
		expectedGraduation: scalarScore(
			result.extraction.expectedGraduation,
			expected.expectedGraduation,
		),
		inProgress: inProgress.f1,
		program: scalarScore(result.extraction.program, expected.program),
		remaining: remaining.f1,
		school: scalarScore(result.extraction.school, expected.school),
		studentName: scalarScore(
			result.extraction.studentName,
			expected.studentName,
		),
	};

	if (expected.mapped?.completedCourseIds) {
		fields.mappedCompleted = setF1(
			result.profile.completedCourseIds,
			expected.mapped.completedCourseIds,
		).f1;
	}
	if (expected.mapped?.inProgressCourseIds) {
		fields.mappedInProgress = setF1(
			result.profile.inProgressCourseIds,
			expected.mapped.inProgressCourseIds,
		).f1;
	}
	if (expected.mapped?.lockedThroughTermId) {
		fields.lockedThroughTermId = scalarScore(
			result.profile.lockedThroughTermId,
			expected.mapped.lockedThroughTermId,
		);
	}
	if (expected.mapped?.school) {
		fields.mappedSchool = scalarScore(
			result.profile.school,
			expected.mapped.school,
		);
	}
	if (expected.mapped?.targetGraduation) {
		fields.targetGraduation = scalarScore(
			result.profile.targetGraduation,
			expected.mapped.targetGraduation,
		);
	}

	return {
		accuracy: mean(Object.values(fields)),
		details: [
			`school=${formatScore(fields.school)}`,
			`completed P=${formatScore(completed.precision)} R=${formatScore(completed.recall)}`,
			`in-progress P=${formatScore(inProgress.precision)} R=${formatScore(inProgress.recall)}`,
			`remaining P=${formatScore(remaining.precision)} R=${formatScore(remaining.recall)}`,
		],
		id: golden.id,
		kind: "transcript",
	};
}

function printSection(title: string, results: CaseResult[]) {
	console.log(`\n${title}`);
	for (const result of results) {
		console.log(
			`  ${result.id.padEnd(34)} field-accuracy ${formatScore(result.accuracy)}   ${result.details.join("  ")}`,
		);
	}
	const sectionMean = mean(results.map((result) => result.accuracy));
	console.log(`  ${"mean".padEnd(34)} ${formatScore(sectionMean)}`);
	return sectionMean;
}

async function main() {
	const jobGoldens = loadJson<JobGolden[]>("goldens/jobs.json");
	const transcriptGoldens = loadJson<TranscriptGolden[]>(
		"goldens/transcripts.json",
	);

	console.log("TermShift extraction evals");
	console.log("Mode: heuristic fallback against golden fixtures (no live LLM)");

	const jobResults = jobGoldens.map(scoreJob);
	const transcriptResults = transcriptGoldens.map(scoreTranscript);
	const jobsMean = printSection("Jobs", jobResults);
	const transcriptsMean = printSection("Transcripts", transcriptResults);
	const overall = mean([jobsMean, transcriptsMean]);

	console.log(`\nOverall field-accuracy: ${formatScore(overall)}`);
	console.log(`Pass threshold: ${formatScore(PASS_THRESHOLD)}`);

	console.log(
		"Live gpt-4o-mini cases skipped. Evals score the heuristic fallback (and goldens) without an API key.",
	);

	if (overall < PASS_THRESHOLD) {
		console.error("FAIL");
		process.exit(1);
	}

	console.log("PASS");
}

void main();
