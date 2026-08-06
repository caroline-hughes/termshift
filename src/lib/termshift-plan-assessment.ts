import { getTermIndex } from "@/lib/pathwise-data";
import type {
	PlannerSnapshot,
	SpecialBlockType,
	StudentProfile,
} from "@/lib/pathwise-types";
import type { OpportunitySuggestion } from "@/lib/termshift-opportunities";

export type PlanInsightTone = "critical" | "neutral" | "warning";

export type PlanInsight = {
	description: string;
	id: string;
	linkedTermId?: string;
	title: string;
	tone: PlanInsightTone;
};

export type PlanRecommendation = {
	description: string;
	id: string;
	linkedTermId?: string;
};

export type PlanAssessment = {
	insights: PlanInsight[];
	issueCount: number;
	recommendations: PlanRecommendation[];
	topIssueTexts: string[];
};

const HORIZON_WARNING =
	"The current horizon ran out of room before every requirement could be placed.";
const HOURS_IN_SIX_MONTH_WORK_TERM = 26 * 40;
const currencyFormatter = new Intl.NumberFormat("en-US", {
	maximumFractionDigits: 0,
});

type SnapshotBlockGroup = {
	endLabel: string;
	endTermId: string;
	startLabel: string;
	startTermId: string;
	type: SpecialBlockType;
};

function getStandardCourseLoad(termId: string) {
	return termId.endsWith("fall") || termId.endsWith("spring") ? 4 : 2;
}

function getProjectedGraduationTermId(snapshot: PlannerSnapshot) {
	return (
		[...snapshot.terms].reverse().find((term) => term.courses.length > 0)
			?.term.id ?? null
	);
}

function getLastRelevantTermIndex(snapshot: PlannerSnapshot) {
	return snapshot.terms.reduce((lastIndex, term) => {
		if (term.courses.length === 0 && !term.specialBlock) {
			return lastIndex;
		}

		return Math.max(lastIndex, getTermIndex(term.term.id));
	}, -1);
}

function buildPlannedPlacementMap(snapshot: PlannerSnapshot) {
	const placements = new Map<string, string>();

	for (const term of snapshot.terms) {
		for (const course of term.courses) {
			if (course.status === "planned") {
				placements.set(course.id, term.term.id);
			}
		}
	}

	return placements;
}

function buildSnapshotBlockGroups(snapshot: PlannerSnapshot) {
	const groups: SnapshotBlockGroup[] = [];
	let currentGroup: SnapshotBlockGroup | null = null;

	for (const term of snapshot.terms) {
		if (!term.specialBlock) {
			currentGroup = null;
			continue;
		}

		const currentIndex = getTermIndex(term.term.id);
		const previousIndex = currentGroup
			? getTermIndex(currentGroup.endTermId)
			: -1;

		if (
			currentGroup &&
			currentGroup.type === term.specialBlock &&
			currentIndex === previousIndex + 1
		) {
			currentGroup.endLabel = term.term.label;
			currentGroup.endTermId = term.term.id;
			continue;
		}

		currentGroup = {
			endLabel: term.term.label,
			endTermId: term.term.id,
			startLabel: term.term.label,
			startTermId: term.term.id,
			type: term.specialBlock,
		};
		groups.push(currentGroup);
	}

	return groups;
}

function formatTermSpan(startLabel: string, endLabel: string) {
	return startLabel === endLabel
		? startLabel
		: `${startLabel} through ${endLabel}`;
}

function describeBlockType(type: SpecialBlockType) {
	if (type === "work-term") return "co-op";
	if (type === "internship") return "internship";
	return "time-off block";
}

function describeGraduationDelta(
	baselineSnapshot: PlannerSnapshot,
	snapshot: PlannerSnapshot,
) {
	const baselineTermId = getProjectedGraduationTermId(baselineSnapshot);
	const currentTermId = getProjectedGraduationTermId(snapshot);

	if (!baselineTermId || !currentTermId) {
		return "TermShift could not compare this path against the current plan yet.";
	}

	const delta = getTermIndex(currentTermId) - getTermIndex(baselineTermId);

	if (delta === 0) {
		return "No graduation change from the current plan.";
	}

	if (delta > 0) {
		return `Graduation moves ${delta} academic term${
			delta === 1 ? "" : "s"
		} later than the current plan.`;
	}

	return `Graduation moves ${Math.abs(delta)} academic term${
		delta === -1 ? "" : "s"
	} earlier than the current plan.`;
}

function buildScenarioSummary(
	snapshot: PlannerSnapshot,
	selectedOpportunity: OpportunitySuggestion | null,
) {
	const blockGroups = buildSnapshotBlockGroups(snapshot);

	if (selectedOpportunity) {
		return `Scenario includes Co-op: ${selectedOpportunity.company} during ${selectedOpportunity.termLabel}.`;
	}

	if (blockGroups.length === 0) {
		return "This baseline path does not currently include a dedicated co-op, internship, or time-off term.";
	}

	const summaries = blockGroups.map((group) => {
		return `${describeBlockType(group.type)} in ${formatTermSpan(
			group.startLabel,
			group.endLabel,
		)}`;
	});

	return `Scenario includes ${summaries.join("; ")}.`;
}

function buildCourseMovementInsight(
	baselineSnapshot: PlannerSnapshot,
	snapshot: PlannerSnapshot,
) {
	const baselinePlacements = buildPlannedPlacementMap(baselineSnapshot);
	const scenarioPlacements = buildPlannedPlacementMap(snapshot);
	const movedLater: string[] = [];

	for (const [courseId, scenarioTermId] of scenarioPlacements) {
		const baselineTermId = baselinePlacements.get(courseId);
		if (!baselineTermId) continue;

		if (getTermIndex(scenarioTermId) > getTermIndex(baselineTermId)) {
			movedLater.push(courseId);
		}
	}

	if (movedLater.length === 0) {
		return "This scenario keeps the remaining modeled coursework on roughly the same sequence as the current plan.";
	}

	return `This scenario pushes ${movedLater.length} planned course${
		movedLater.length === 1 ? "" : "s"
	} later than the current plan.`;
}

function buildWorkTermFitInsights(selectedOpportunity: OpportunitySuggestion) {
	const insights: PlanInsight[] = [];
	const earnings = parseEstimatedEarnings(selectedOpportunity.compensation);

	if (earnings) {
		insights.push({
			description: `Estimated earnings are about ${earnings.estimateText} over six months at ${earnings.rateText}.`,
			id: `earnings-${selectedOpportunity.id}`,
			title: "Estimated earnings",
			tone: "neutral",
		});
	}

	insights.push({
		description: `Likely skill exposure includes ${selectedOpportunity.focusAreas.join(
			", ",
		)}.`,
		id: `skills-${selectedOpportunity.id}`,
		title: "Likely skill exposure",
		tone: "neutral",
	});

	if (selectedOpportunity.matchedCourseCodes.length > 0) {
		insights.push({
			description: `Your completed or in-progress coursework already aligns with ${selectedOpportunity.matchedCourseCodes.join(
				", ",
			)}.`,
			id: `alignment-${selectedOpportunity.id}`,
			title: "Coursework alignment",
			tone: "neutral",
		});
	}

	if (selectedOpportunity.missingCourseCodes.length > 0) {
		insights.push({
			description: `Before this role, TermShift would still want to see ${selectedOpportunity.missingCourseCodes.join(
				", ",
			)}.`,
			id: `readiness-${selectedOpportunity.id}`,
			title: "Readiness gaps",
			tone: "warning",
		});
	}

	return insights;
}

function parseEstimatedEarnings(compensation?: string) {
	if (!compensation) return null;

	const match = compensation.match(
		/\$(\d+(?:\.\d+)?)(?:\s*-\s*\$?(\d+(?:\.\d+)?))?\s*\/?\s*(?:hr|hour)/i,
	);

	if (!match) return null;

	const low = Number(match[1]);
	const high = Number(match[2] ?? match[1]);
	const average = (low + high) / 2;
	const estimate = average * HOURS_IN_SIX_MONTH_WORK_TERM;

	return {
		estimateText: `$${currencyFormatter.format(
			Math.round(estimate / 100) * 100,
		)}`,
		rateText:
			low === high
				? `$${currencyFormatter.format(low)}/hr`
				: `$${currencyFormatter.format(low)}-$${currencyFormatter.format(
						high,
				  )}/hr`,
	};
}

function buildIssueInsights(profile: StudentProfile, snapshot: PlannerSnapshot) {
	const issues: PlanInsight[] = [];
	const projectedGraduationTermId = getProjectedGraduationTermId(snapshot);
	const lastRelevantTermIndex = getLastRelevantTermIndex(snapshot);

	for (const term of snapshot.terms) {
		const termIndex = getTermIndex(term.term.id);
		const standardLoad = getStandardCourseLoad(term.term.id);
		const offeringConflicts: string[] = [];
		const prereqConflicts: string[] = [];

		for (const course of term.courses) {
			for (const conflict of course.conflicts) {
				if (conflict.startsWith("Prerequisite timing issue: ")) {
					const prereqCode = conflict.replace(
						"Prerequisite timing issue: ",
						"",
					);
					prereqConflicts.push(
						`${course.code} before ${prereqCode.replace(/\.$/, "")}`,
					);
				}

				if (conflict === "Modeled as not normally offered in this term.") {
					offeringConflicts.push(course.code);
				}
			}
		}

		if (prereqConflicts.length > 0) {
			issues.push({
				description: `${term.term.label} has prerequisite sequencing issues: ${prereqConflicts.join(
					"; ",
				)}.`,
				id: `prereq-${term.term.id}`,
				linkedTermId: term.term.id,
				title: "Prerequisite order issue",
				tone: "critical",
			});
		}

		if (offeringConflicts.length > 0) {
			issues.push({
				description: `${offeringConflicts.join(
					", ",
				)} ${
					offeringConflicts.length === 1 ? "is" : "are"
				} not typically offered in ${term.term.label}.`,
				id: `offering-${term.term.id}`,
				linkedTermId: term.term.id,
				title: "Term offering mismatch",
				tone: "warning",
			});
		}

		if (term.locked || termIndex > lastRelevantTermIndex) {
			continue;
		}

		if (!term.specialBlock && term.courses.length > standardLoad) {
			issues.push({
				description: `${term.term.label} carries ${term.courses.length} planned courses. This model expects ${standardLoad}.`,
				id: `overload-${term.term.id}`,
				linkedTermId: term.term.id,
				title: "Overloaded term",
				tone: "critical",
			});
		}

		if (
			term.specialBlock === "internship" &&
			term.courses.length > 1
		) {
			issues.push({
				description: `${term.term.label} pairs an internship block with ${term.courses.length} courses. This is likely too heavy for a working term.`,
				id: `internship-load-${term.term.id}`,
				linkedTermId: term.term.id,
				title: "Internship load warning",
				tone: "critical",
			});
		}

		if (
			!term.specialBlock &&
			term.term.id !== projectedGraduationTermId &&
			term.courses.length < standardLoad
		) {
			issues.push({
				description:
					profile.school === "Northeastern University"
						? `${term.term.label} is underloaded at ${term.courses.length} of ${standardLoad} courses. At Northeastern, reduced load can affect full-time billing, scholarships, or aid eligibility.`
						: `${term.term.label} is underloaded at ${term.courses.length} of ${standardLoad} courses. Verify whether a reduced load is acceptable for your program and aid status.`,
				id: `underload-${term.term.id}`,
				linkedTermId: term.term.id,
				title: "Underloaded term",
				tone: "warning",
			});
		}
	}

	if (snapshot.warnings.includes(HORIZON_WARNING)) {
		issues.push({
			description:
				"TermShift ran out of modeled room before every requirement could be placed.",
			id: "horizon-limit",
			title: "Modeled horizon limit",
			tone: "critical",
		});
	}

	return issues;
}

function buildRecommendations(
	profile: StudentProfile,
	snapshot: PlannerSnapshot,
	issues: PlanInsight[],
	baselineSnapshot: PlannerSnapshot,
	selectedOpportunity: OpportunitySuggestion | null,
	experimentMode: boolean,
) {
	const recommendations: PlanRecommendation[] = [];
	const blocks = buildSnapshotBlockGroups(snapshot);
	const hasExperientialBlock = blocks.some(
		(block) => block.type === "work-term" || block.type === "internship",
	);
	const projectedDelta = describeGraduationDelta(baselineSnapshot, snapshot);

	const prereqIssue = issues.find((issue) => issue.id.startsWith("prereq-"));
	if (prereqIssue) {
		recommendations.push({
			description:
				"Move the affected course after its prerequisite is completed, then rerun the scenario.",
			id: "fix-prereq-order",
			linkedTermId: prereqIssue.linkedTermId,
		});
	}

	const offeringIssue = issues.find((issue) =>
		issue.id.startsWith("offering-"),
	);
	if (offeringIssue) {
		recommendations.push({
			description:
				"Shift the flagged course into a term where it is normally offered to avoid a fragile plan.",
			id: "fix-offering-mismatch",
			linkedTermId: offeringIssue.linkedTermId,
		});
	}

	const overloadIssue = issues.find(
		(issue) =>
			issue.id.startsWith("overload-") ||
			issue.id.startsWith("internship-load-"),
	);
	if (overloadIssue) {
		recommendations.push({
			description:
				"Move one planned course out of the overloaded term or reduce coursework during the work experience window.",
			id: "fix-overload",
			linkedTermId: overloadIssue.linkedTermId,
		});
	}

	const underloadIssue = issues.find((issue) =>
		issue.id.startsWith("underload-"),
	);
	if (underloadIssue) {
		recommendations.push({
			description:
				profile.school === "Northeastern University"
					? "If you keep this reduced load, verify full-time billing and aid implications with Northeastern Student Financial Services."
					: "If you keep this reduced load, verify program and aid implications before finalizing the plan.",
			id: "check-underload",
			linkedTermId: underloadIssue.linkedTermId,
		});
	}

	if (!hasExperientialBlock && !experimentMode) {
		recommendations.push({
			description:
				"Test a July-December or January-June co-op scenario to compare experience gained against time-to-graduation.",
			id: "try-work-term-scenario",
		});
	}

	if (selectedOpportunity?.missingCourseCodes.length) {
		recommendations.push({
			description: `Before targeting this listing, prioritize ${selectedOpportunity.missingCourseCodes.join(
				", ",
			)}.`,
			id: "close-readiness-gaps",
		});
	}

	if (
		experimentMode &&
		hasExperientialBlock &&
		projectedDelta !== "No graduation change from the current plan."
	) {
		recommendations.push({
			description:
				"If minimizing graduation delay matters more than this work term, compare a later co-op window or a shorter internship scenario.",
			id: "compare-graduation-tradeoff",
		});
	}

	if (recommendations.length === 0) {
		recommendations.push({
			description: experimentMode
				? "This scenario is clean enough to save and compare against other work-term options."
				: "You are in a stable modeled path. Use experiment mode when you want to test co-op or internship tradeoffs.",
			id: "stable-path",
		});
	}

	return recommendations;
}

export function buildPlanAssessment({
	baselineSnapshot,
	experimentMode,
	profile,
	selectedOpportunity,
	snapshot,
}: {
	baselineSnapshot: PlannerSnapshot;
	experimentMode: boolean;
	profile: StudentProfile;
	selectedOpportunity?: OpportunitySuggestion | null;
	snapshot: PlannerSnapshot;
}): PlanAssessment {
	const insights: PlanInsight[] = [
		{
			description: experimentMode
				? `This scenario currently lands at ${snapshot.projectedGraduation}.`
				: `Your current modeled path lands at ${snapshot.projectedGraduation}.`,
			id: "graduation",
			title: "Projected graduation",
			tone: "neutral",
		},
		{
			description: describeGraduationDelta(baselineSnapshot, snapshot),
			id: "graduation-delta",
			title: "Change vs current plan",
			tone: "neutral",
		},
		{
			description: buildScenarioSummary(
				snapshot,
				experimentMode ? selectedOpportunity ?? null : null,
			),
			id: "scenario-summary",
			title: "Scenario includes",
			tone: "neutral",
		},
		{
			description: buildCourseMovementInsight(
				baselineSnapshot,
				snapshot,
			),
			id: "academic-impact",
			title: "Academic impact",
			tone: "neutral",
		},
	];

	if (!snapshot.warnings.includes(HORIZON_WARNING)) {
		insights.push({
			description:
				"This path still completes all modeled requirements inside the current planning horizon.",
			id: "completion-status",
			title: "Modeled completion",
			tone: "neutral",
		});
	}

	if (experimentMode && selectedOpportunity) {
		insights.push(...buildWorkTermFitInsights(selectedOpportunity));
	}

	const issueInsights = buildIssueInsights(profile, snapshot);

	if (!experimentMode && issueInsights.length === 0) {
		insights.push({
			description:
				"You are on track academically under the current model.",
			id: "on-track",
			title: "Modeled status",
			tone: "neutral",
		});
	}

	insights.push(...issueInsights);

	return {
		insights,
		issueCount: issueInsights.length,
		recommendations: buildRecommendations(
			profile,
			snapshot,
			issueInsights,
			baselineSnapshot,
			experimentMode ? selectedOpportunity ?? null : null,
			experimentMode,
		),
		topIssueTexts: issueInsights.slice(0, 3).map((issue) => issue.description),
	};
}
