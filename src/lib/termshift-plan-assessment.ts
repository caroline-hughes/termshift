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

export type PlanAssessment = {
	insights: PlanInsight[];
	issueCount: number;
	topIssueTexts: string[];
};

const HORIZON_WARNING =
	"The current horizon ran out of room before every requirement could be placed.";

type SnapshotBlockGroup = {
	endTermId: string;
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

function getGraduationDeltaTerms(
	baselineSnapshot: PlannerSnapshot,
	snapshot: PlannerSnapshot,
) {
	const baselineTermId = getProjectedGraduationTermId(baselineSnapshot);
	const currentTermId = getProjectedGraduationTermId(snapshot);

	if (!baselineTermId || !currentTermId) {
		return null;
	}

	return getTermIndex(currentTermId) - getTermIndex(baselineTermId);
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
			currentGroup.endTermId = term.term.id;
			continue;
		}

		currentGroup = {
			endTermId: term.term.id,
			startTermId: term.term.id,
			type: term.specialBlock,
		};
		groups.push(currentGroup);
	}

	return groups;
}

function hasExperientialBlock(snapshot: PlannerSnapshot) {
	return buildSnapshotBlockGroups(snapshot).some(
		(group) =>
			group.type === "work-term" || group.type === "internship",
	);
}

function buildSummerRecoverySuggestion(
	profile: StudentProfile,
	snapshot: PlannerSnapshot,
) {
	const experientialGroup = buildSnapshotBlockGroups(snapshot).find(
		(group) =>
			group.type === "work-term" || group.type === "internship",
	);

	if (!experientialGroup) {
		return "Add coursework after the work term to recover time.";
	}

	const endTerm = snapshot.terms.find(
		(term) => term.term.id === experientialGroup.endTermId,
	)?.term;

	if (!endTerm) {
		return "Add coursework after the work term to recover time.";
	}

	if (profile.school === "Northeastern University") {
		if (endTerm.kind === "fall") {
			return `Take Summer 1 or Summer 2 ${endTerm.year + 1} courses to graduate a semester earlier.`;
		}

		if (endTerm.kind === "spring") {
			return `Take Summer 1 or Summer 2 ${endTerm.year} courses to recover time.`;
		}

		if (endTerm.kind === "summer1") {
			return `Take Summer 2 ${endTerm.year} courses to recover time.`;
		}

		if (endTerm.kind === "summer2") {
			return `Take Spring or Summer 1 ${endTerm.year + 1} courses to recover time.`;
		}
	}

	return "Add coursework after the work term to recover time.";
}

function buildTimelineInsight(
	profile: StudentProfile,
	baselineSnapshot: PlannerSnapshot,
	snapshot: PlannerSnapshot,
): PlanInsight | null {
	const delta = getGraduationDeltaTerms(baselineSnapshot, snapshot);

	if (delta === null) {
		return null;
	}

	if (delta > 0) {
		const description = hasExperientialBlock(snapshot)
			? `Projected graduation pushed to ${snapshot.projectedGraduation}. ${buildSummerRecoverySuggestion(
					profile,
					snapshot,
			  )}`
			: `Projected graduation pushed to ${snapshot.projectedGraduation}.`;

		return {
			description,
			id: "timeline-shift",
			title: "Timeline",
			tone: "neutral",
		};
	}

	if (delta < 0) {
		return {
			description: `Projected graduation pulled up to ${snapshot.projectedGraduation}.`,
			id: "timeline-shift",
			title: "Timeline",
			tone: "neutral",
		};
	}

	return {
		description: `Projected graduation stays at ${snapshot.projectedGraduation}.`,
		id: "timeline-shift",
		title: "Timeline",
		tone: "neutral",
	};
}

function buildWritingWindowInsight(
	profile: StudentProfile,
	snapshot: PlannerSnapshot,
): PlanInsight | null {
	if (profile.school !== "Northeastern University") {
		return null;
	}

	if (!hasExperientialBlock(snapshot)) {
		return null;
	}

	const engwTerm = snapshot.terms.find((term) =>
		term.courses.some(
			(course) => course.id === "engw3302" && course.status === "planned",
		),
	);

	if (!engwTerm || engwTerm.specialBlock) {
		return null;
	}

	return {
		description:
			"Many Northeastern students take ENGW 3302 online during co-op. Consider moving it into that window.",
		id: "engw-online-option",
		linkedTermId: engwTerm.term.id,
		title: "Writing option",
		tone: "neutral",
	};
}

function buildIssueInsights(profile: StudentProfile, snapshot: PlannerSnapshot) {
	const issues: PlanInsight[] = [];
	const projectedGraduationTermId = getProjectedGraduationTermId(snapshot);
	const lastRelevantTermIndex = getLastRelevantTermIndex(snapshot);

	for (const term of snapshot.terms) {
		const termIndex = getTermIndex(term.term.id);
		const standardLoad = getStandardCourseLoad(term.term.id);
		const prereqConflicts: string[] = [];

		for (const course of term.courses) {
			for (const conflict of course.conflicts) {
				if (conflict.startsWith("Prerequisite timing issue: ")) {
					const prereqCode = conflict.replace(
						"Prerequisite timing issue: ",
						"",
					);
					prereqConflicts.push(
						`${course.code} comes before ${prereqCode.replace(
							/\.$/,
							"",
						)}`,
					);
				}
			}
		}

		if (prereqConflicts.length > 0) {
			issues.push({
				description: `${prereqConflicts.join(
					"; ",
				)}. Move it later in the plan.`,
				id: `prereq-${term.term.id}`,
				linkedTermId: term.term.id,
				title: "Prerequisite order",
				tone: "critical",
			});
		}

		if (term.locked || termIndex > lastRelevantTermIndex) {
			continue;
		}

		if (!term.specialBlock && term.courses.length > standardLoad) {
			issues.push({
				description: `${term.term.label} has ${term.courses.length} planned courses. Move one course out.`,
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
				description: `${term.term.label} pairs an internship with ${term.courses.length} courses. Reduce coursework in that term.`,
				id: `internship-load-${term.term.id}`,
				linkedTermId: term.term.id,
				title: "Internship load",
				tone: "critical",
			});
		}

		if (
			!term.specialBlock &&
			term.term.id !== projectedGraduationTermId &&
			term.term.kind !== "summer1" &&
			term.term.kind !== "summer2" &&
			term.courses.length < standardLoad
		) {
			issues.push({
				description:
					profile.school === "Northeastern University"
						? `${term.term.label} is underloaded at ${term.courses.length} of ${standardLoad} courses. Reduced load can affect billing or aid.`
						: `${term.term.label} is underloaded at ${term.courses.length} of ${standardLoad} courses. Verify whether reduced load is acceptable.`,
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
			title: "Planning horizon",
			tone: "critical",
		});
	}

	return issues;
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
	const issueInsights = buildIssueInsights(profile, snapshot);

	if (!experimentMode) {
		if (issueInsights.length > 0) {
			return {
				insights: issueInsights,
				issueCount: issueInsights.length,
				topIssueTexts: issueInsights
					.slice(0, 3)
					.map((issue) => issue.description),
			};
		}

		return {
			insights: [
				{
					description: `You are on track academically under the current model. Projected graduation in ${snapshot.projectedGraduation}.`,
					id: "status",
					title: "Status",
					tone: "neutral",
				},
			],
			issueCount: 0,
			topIssueTexts: [],
		};
	}

	const insights: PlanInsight[] = [];
	const timelineInsight = buildTimelineInsight(
		profile,
		baselineSnapshot,
		snapshot,
	);

	if (timelineInsight) {
		insights.push(timelineInsight);
	}

	const writingWindowInsight = buildWritingWindowInsight(profile, snapshot);
	if (writingWindowInsight) {
		insights.push(writingWindowInsight);
	}

	if (
		selectedOpportunity &&
		issueInsights.length === 0 &&
		hasExperientialBlock(snapshot)
	) {
		insights.push({
			description: `Scenario includes ${
				selectedOpportunity.blockType === "internship"
					? "internship"
					: "co-op"
			} at ${selectedOpportunity.company}.`,
			id: "work-term-summary",
			title: "Scenario",
			tone: "neutral",
		});
	}

	insights.push(...issueInsights);

	if (insights.length === 0) {
		insights.push({
			description: `Projected graduation stays at ${snapshot.projectedGraduation}. This scenario remains on track under the current model.`,
			id: "experimental-status",
			title: "Status",
			tone: "neutral",
		});
	}

	return {
		insights,
		issueCount: issueInsights.length,
		topIssueTexts: issueInsights.slice(0, 3).map((issue) => issue.description),
	};
}
