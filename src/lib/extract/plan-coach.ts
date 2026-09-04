import { z } from "zod";

export const planCoachInsightSchema = z.strictObject({
	description: z.string(),
	id: z.string(),
	title: z.string(),
	tone: z.enum(["critical", "neutral", "warning"]),
});

export const planCoachOpportunitySchema = z.strictObject({
	blockType: z.enum(["internship", "work-term"]),
	company: z.string(),
});

export const planCoachRequestSchema = z.strictObject({
	experimentMode: z.boolean(),
	insights: z.array(planCoachInsightSchema),
	issueCount: z.number(),
	projectedGraduation: z.union([z.string(), z.null()]),
	selectedOpportunity: z.union([planCoachOpportunitySchema, z.null()]),
	topIssueTexts: z.array(z.string()),
});

export type PlanCoachRequest = z.infer<typeof planCoachRequestSchema>;

type CoachInsightInput = {
	description: string;
	id: string;
	title: string;
	tone: "critical" | "neutral" | "warning";
};

type CoachOpportunityInput = {
	blockType?: string | null;
	company: string;
} | null;

function toCoachOpportunity(
	opportunity?: CoachOpportunityInput,
): PlanCoachRequest["selectedOpportunity"] {
	const company = opportunity?.company.trim() ?? "";
	if (!company) {
		return null;
	}

	return {
		blockType:
			opportunity?.blockType === "internship" ? "internship" : "work-term",
		company,
	};
}

export function buildPlanCoachRequest({
	experimentMode,
	insights,
	issueCount,
	projectedGraduation,
	selectedOpportunity,
	topIssueTexts,
}: {
	experimentMode: boolean;
	insights: CoachInsightInput[];
	issueCount: number;
	projectedGraduation: string | null;
	selectedOpportunity?: CoachOpportunityInput;
	topIssueTexts: string[];
}): PlanCoachRequest {
	return {
		experimentMode,
		insights: insights.map((insight) => ({
			description: insight.description,
			id: insight.id,
			title: insight.title,
			tone: insight.tone,
		})),
		issueCount,
		projectedGraduation: projectedGraduation?.trim() || null,
		selectedOpportunity: toCoachOpportunity(selectedOpportunity),
		topIssueTexts: topIssueTexts.filter((text) => text.trim()),
	};
}

export function getPlanCoachRequestKey(request: PlanCoachRequest) {
	return JSON.stringify(request);
}

export function buildPlanCoachPrompt(request: PlanCoachRequest) {
	const opportunityLine = request.selectedOpportunity
		? `${request.selectedOpportunity.blockType} at ${request.selectedOpportunity.company}`
		: "none";
	const insightLines =
		request.insights.length > 0
			? request.insights
					.map(
						(insight) =>
							`- [${insight.tone}] ${insight.title} (${insight.id}): ${insight.description}`,
					)
					.join("\n")
			: "- none";
	const topIssues =
		request.topIssueTexts.length > 0
			? request.topIssueTexts.map((text) => `- ${text}`).join("\n")
			: "- none";

	return {
		prompt: [
			"Explain the following deterministic Plan Insights in 2-4 sentences.",
			`Experiment mode: ${request.experimentMode ? "yes" : "no"}`,
			`Projected graduation: ${request.projectedGraduation ?? "unknown"}`,
			`Selected opportunity: ${opportunityLine}`,
			`Issue count: ${request.issueCount}`,
			"Insights:",
			insightLines,
			"Top issues:",
			topIssues,
		].join("\n"),
		system: [
			"You are TermShift Plan Coach, a short explanatory layer over an existing academic planner.",
			"The Plan Insights you receive were computed by deterministic rules. Restate them in plain language.",
			"Do not invent new recommended moves, courses, terms, internships, or graduation outcomes.",
			"Do not claim the student applied a fix, and do not tell them to click Apply unless that action is already implied by an insight title such as Prerequisite order or Overloaded term.",
			"Do not mention AI, models, prompts, or that these findings came from rules.",
			"If issueCount is 0, briefly confirm the plan looks on track under the current model.",
			"Keep the note to 2-4 sentences.",
		].join(" "),
	};
}
