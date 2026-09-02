import type {
	ExtractedCourse,
	TranscriptExtraction,
} from "@/lib/extract/types";
import { normalizeWhitespace } from "@/lib/extract/html";

const COURSE_CODE_PATTERN =
	/\b(?:CS|DS|EECE|ENGW|MATH|COMM|CY)\s+\d{3,4}(?:\/\d{3,4})?\b|\b(?:COMS|ENGI)\s+[A-Z]\d{4}\b|\bSCIENCE\s+(?:III|II|I)\b|\b(?:GEN EL|KHOURY EL)\s+\d+\b/g;

const TERM_HEADER_PATTERN =
	/\b(Fall|Spring|Summer\s*1|Summer\s*2|Summer|Winter)\s+(20\d{2})\b/gi;

function findAll(text: string, pattern: RegExp) {
	const matches: Array<{ index: number; value: string }> = [];
	const globalPattern = new RegExp(
		pattern.source,
		pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`,
	);

	for (const match of text.matchAll(globalPattern)) {
		if (match.index === undefined) continue;
		matches.push({ index: match.index, value: match[0] });
	}

	return matches;
}

function nearestBefore(
	index: number,
	markers: Array<{ index: number; value: string }>,
) {
	let nearest: { index: number; value: string } | null = null;

	for (const marker of markers) {
		if (marker.index > index) break;
		nearest = marker;
	}

	return nearest;
}

function detectSchool(text: string) {
	if (/northeastern university/i.test(text)) return "Northeastern University";
	if (/columbia university/i.test(text)) return "Columbia University";
	return "";
}

function detectProgram(text: string) {
	const programMatch = text.match(
		/\b(?:B\.S\.|M\.S\.|Bachelor of Science|Master of Science)\s+in\s+[A-Za-z &]+/i,
	);
	return programMatch ? normalizeWhitespace(programMatch[0]) : "";
}

function detectStudentName(text: string) {
	const idName = text.match(
		/\b\d{6,}\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/,
	);
	if (idName?.[1]) return normalizeWhitespace(idName[1]);

	const uniName = text.match(/\b([A-Z][a-z]+\s+[A-Z][a-z]+)\s+UNI\b/);
	if (uniName?.[1]) return normalizeWhitespace(uniName[1]);

	const studentName = text.match(
		/\bStudent\b[\s\S]{0,120}?\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b/,
	);
	if (studentName?.[1]) return normalizeWhitespace(studentName[1]);

	return "";
}

function detectGraduation(text: string) {
	const match = text.match(
		/Expected graduation[\s\S]{0,160}?(Fall|Spring|Summer(?:\s*[12])?)\s+(20\d{2})/i,
	);
	if (!match) return "";
	return normalizeWhitespace(`${match[1]} ${match[2]}`);
}

function detectStartYear(text: string) {
	const match = text.match(/\b(?:Fall|Spring|Summer\s*[12]?)\s+(20\d{2})\b/);
	if (!match) return 0;
	return Number(match[1]);
}

function titleAfterCode(text: string, codeEnd: number) {
	const window = text.slice(codeEnd, codeEnd + 90);
	const untilCredits = window.match(
		/^\s+([A-Za-z][A-Za-z0-9 &/+'-]{2,60}?)(?:\s+\d+(?:\.\d{2})?\b|\s+[A-Z][A-Z &]{2,40}\s+\d)/,
	);
	return untilCredits ? normalizeWhitespace(untilCredits[1]) : "";
}

function gradeNear(text: string, index: number) {
	const window = text.slice(index, index + 120);
	const match = window.match(/\b(IP|RG|[A-D][+-]?|F|W|P)\b/);
	return match?.[1] ?? "";
}

function classifyCourse(
	index: number,
	inProgressIdx: number,
	futureIdx: number,
	remainingIdx: number,
	grade: string,
) {
	if (remainingIdx >= 0 && index >= remainingIdx) return "remaining" as const;
	if (futureIdx >= 0 && index >= futureIdx) return "remaining" as const;
	if (inProgressIdx >= 0 && index >= inProgressIdx) return "in-progress" as const;
	if (grade === "IP") return "in-progress" as const;
	if (grade === "RG") return "remaining" as const;
	return "completed" as const;
}

function extractRemainingPhrases(text: string, remainingIdx: number) {
	if (remainingIdx < 0) return [];

	const notesIdx = text.search(/Program Notes/i);
	const section = text.slice(
		remainingIdx,
		notesIdx > remainingIdx ? notesIdx : remainingIdx + 1800,
	);
	const phrases: string[] = [];
	const seen = new Set<string>();

	const push = (value: string) => {
		const normalized = normalizeWhitespace(value);
		const key = normalized.toLowerCase();
		if (!normalized || seen.has(key) || normalized.length < 8) return;
		seen.add(key);
		phrases.push(normalized);
	};

	if (/ethical ai core/i.test(section)) push("Ethical AI core");
	if (/AI &\s*Advanced Computing/i.test(section)) {
		push("AI & Advanced Computing concentration");
	}
	if (/General electives/i.test(section)) {
		push("General electives / capstone / research");
	}

	const chunks = [
		...section.matchAll(
			/([A-Z][A-Za-z0-9 &/]{8,70}?)\s+(?:Not yet started|\d+\s+points)/g,
		),
	];
	for (const chunk of chunks) {
		push(chunk[1]);
	}

	return phrases;
}

export function extractTranscriptHeuristically(
	text: string,
	_fileName = "",
): TranscriptExtraction {
	const inProgressIdx = text.search(/Courses in Progress|Current Registration/i);
	const futureIdx = text.search(/Future Registration/i);
	const remainingIdx = text.search(/Remaining Program Requirements/i);
	const termHeaders = findAll(text, TERM_HEADER_PATTERN).map((marker) => ({
		index: marker.index,
		value: normalizeWhitespace(marker.value),
	}));
	const completedCourses: ExtractedCourse[] = [];
	const inProgressCourses: ExtractedCourse[] = [];
	const remainingCourses: ExtractedCourse[] = [];
	const seen = new Set<string>();

	for (const match of findAll(text, COURSE_CODE_PATTERN)) {
		const code = normalizeWhitespace(match.value);
		const key = code.toUpperCase();
		if (seen.has(key)) continue;
		seen.add(key);

		const term = nearestBefore(match.index, termHeaders)?.value ?? "";
		const title = titleAfterCode(text, match.index + match.value.length);
		const grade = gradeNear(text, match.index);
		const course: ExtractedCourse = { code, grade, term, title };
		const bucket = classifyCourse(
			match.index,
			inProgressIdx,
			futureIdx,
			remainingIdx,
			grade,
		);

		if (bucket === "in-progress") inProgressCourses.push(course);
		else if (bucket === "remaining") remainingCourses.push(course);
		else completedCourses.push(course);
	}

	const remainingRequirements = [
		...extractRemainingPhrases(text, remainingIdx),
		...remainingCourses.map((course) => course.code),
	];

	return {
		completedCourses,
		expectedGraduation: detectGraduation(text),
		inProgressCourses,
		program: detectProgram(text),
		remainingRequirements,
		school: detectSchool(text),
		startYear: detectStartYear(text),
		studentName: detectStudentName(text),
	};
}
