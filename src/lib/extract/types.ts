import type { StudentProfile } from "@/lib/pathwise-types";
import type { WorkOpportunity } from "@/lib/termshift-opportunities";

export type ExtractionSource = "heuristic" | "llm";
export type ExtractionFallbackReason = "llm-error" | "no-key" | null;

export type ExtractedCourse = {
	code: string;
	grade?: string;
	term?: string;
	title: string;
};

export type TranscriptExtraction = {
	completedCourses: ExtractedCourse[];
	expectedGraduation: string;
	inProgressCourses: ExtractedCourse[];
	program: string;
	remainingRequirements: string[];
	school: string;
	startYear: number;
	studentName: string;
};

export type JobExtractionResult = {
	extractionNote: string;
	extractionSource: ExtractionSource;
	opportunity: WorkOpportunity;
};

export type TranscriptExtractionResult = {
	extractionNote: string;
	extractionSource: ExtractionSource;
	profile: StudentProfile;
	remainingRequirements: string[];
};
