import { z } from "zod";

const requiredNullableString = (description: string) =>
	z.union([z.string(), z.null()]).describe(description);

export const extractedCourseSchema = z.strictObject({
	code: z
		.string()
		.describe("Course code as printed, e.g. CS 3650 or COMS W4701"),
	grade: requiredNullableString(
		"Letter grade, IP, or RG if listed; otherwise empty string or null",
	),
	term: requiredNullableString(
		"Term label such as Fall 2025 or Spring 2026; otherwise empty string or null",
	),
	title: z
		.string()
		.describe("Course title if present, otherwise empty string"),
});

export const jobExtractionSchema = z.strictObject({
	blockType: z
		.enum(["internship", "work-term"])
		.describe("work-term for co-op/work term roles, otherwise internship"),
	company: z.string().describe("Hiring company name only"),
	compensation: requiredNullableString(
		"Pay string if listed; otherwise empty string or null",
	),
	focusAreas: z
		.array(z.string())
		.describe("Up to 3 short focus labels such as Robotics or Full-stack"),
	location: z
		.string()
		.describe("City, ST or similar; Location not listed if unknown"),
	preferredCourseIds: z
		.array(z.string())
		.describe("Up to 4 catalog IDs from the provided Northeastern BSCS list"),
	summary: z
		.string()
		.describe("One or two sentence description of the role, max 280 characters"),
	termEndId: z.string().describe("End academic term id from the allowed list"),
	termLabel: z
		.string()
		.describe("Human term label such as July-December 2027 or Fall 2027"),
	termStartId: z.string().describe("Start academic term id from the allowed list"),
	title: z.string().describe("Job title only, without company or location"),
});

export const transcriptExtractionSchema = z.strictObject({
	completedCourses: z
		.array(extractedCourseSchema)
		.describe("Courses already completed with a letter grade"),
	expectedGraduation: z
		.string()
		.describe("Expected graduation term if listed, e.g. Spring 2027"),
	inProgressCourses: z
		.array(extractedCourseSchema)
		.describe("Courses currently in progress (IP) or current registration"),
	program: z.string().describe("Degree program, e.g. B.S. in Computer Science"),
	remainingRequirements: z
		.array(z.string())
		.describe("Unsatisfied degree requirements or future-registered courses"),
	school: z.string().describe("University name"),
	startYear: z
		.number()
		.describe("First academic year on the record, e.g. 2024"),
	studentName: z.string().describe("Student name if present"),
});

export const planCoachSchema = z.strictObject({
	note: z
		.string()
		.describe(
			"2-4 sentence plain-language explanation of the provided Plan Insights only. Do not invent new recommended moves, courses, terms, or actions.",
		),
});

export type JobExtraction = z.infer<typeof jobExtractionSchema>;
export type TranscriptLlmExtraction = z.infer<typeof transcriptExtractionSchema>;
export type PlanCoachExtraction = z.infer<typeof planCoachSchema>;
