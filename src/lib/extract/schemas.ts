import { z } from "zod";

export const extractedCourseSchema = z.object({
	code: z.string().describe("Course code as printed, e.g. CS 3650 or COMS W4701"),
	grade: z
		.string()
		.optional()
		.describe("Letter grade, IP, RG, or empty if not listed"),
	term: z
		.string()
		.optional()
		.describe("Term label such as Fall 2025 or Spring 2026"),
	title: z.string().describe("Course title if present, otherwise empty string"),
});

export const jobExtractionSchema = z.object({
	blockType: z
		.enum(["internship", "work-term"])
		.describe("work-term for co-op/work term roles, otherwise internship"),
	company: z.string().describe("Hiring company name only"),
	compensation: z
		.string()
		.optional()
		.describe("Pay string if listed, otherwise omit"),
	focusAreas: z
		.array(z.string())
		.describe("Up to 3 short focus labels such as Robotics or Full-stack"),
	location: z.string().describe("City, ST or similar; Location not listed if unknown"),
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

export const transcriptExtractionSchema = z.object({
	completedCourses: z
		.array(extractedCourseSchema)
		.describe("Courses already completed with a letter grade"),
	expectedGraduation: z
		.string()
		.describe("Expected graduation term if listed, e.g. Spring 2027"),
	inProgressCourses: z
		.array(extractedCourseSchema)
		.describe("Courses currently in progress (IP) or current registration"),
	program: z
		.string()
		.describe("Degree program, e.g. B.S. in Computer Science"),
	remainingRequirements: z
		.array(z.string())
		.describe("Unsatisfied degree requirements or future-registered courses"),
	school: z.string().describe("University name"),
	startYear: z
		.number()
		.describe("First academic year on the record, e.g. 2024"),
	studentName: z.string().describe("Student name if present"),
});

export type JobExtraction = z.infer<typeof jobExtractionSchema>;
export type TranscriptLlmExtraction = z.infer<typeof transcriptExtractionSchema>;
