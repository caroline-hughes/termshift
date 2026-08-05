import { COURSE_MAP } from "@/lib/pathwise-data";
import type { StudentProfile } from "@/lib/pathwise-types";

export type WorkOpportunity = {
  company: string;
  focusAreas: string[];
  id: string;
  location: string;
  preferredCourseIds: string[];
  schoolScope: string[];
  summary: string;
  termEndId: string;
  termLabel: string;
  termStartId: string;
  title: string;
};

export type OpportunitySuggestion = WorkOpportunity & {
  fitScore: number;
  matchedCourseCodes: string[];
  missingCourseCodes: string[];
};

const ANY_SCHOOL = "Any";

const SEEDED_OPPORTUNITIES: WorkOpportunity[] = [
  {
    id: "vector-platform-coop",
    title: "Software Engineering Co-op",
    company: "Vector Systems",
    location: "Boston, MA",
    termLabel: "July-December 2026",
    termStartId: "2026-summer2",
    termEndId: "2026-fall",
    summary:
      "Join the platform engineering group to ship internal tooling, deployment automation, and observability workflows used across product teams.",
    focusAreas: ["Platform engineering", "Developer tooling", "Backend systems"],
    preferredCourseIds: ["cs3000", "cs3100", "cs3650", "softwareB"],
    schoolScope: ["Northeastern University", ANY_SCHOOL],
  },
  {
    id: "atlas-product-coop",
    title: "Product Engineering Co-op",
    company: "Atlas Health",
    location: "Boston, MA",
    termLabel: "January-June 2027",
    termStartId: "2027-spring",
    termEndId: "2027-summer1",
    summary:
      "Work on patient-facing product surfaces with a full-stack team focused on experimentation, shipping velocity, and pragmatic product engineering.",
    focusAreas: ["Full-stack", "Product engineering", "Web systems"],
    preferredCourseIds: ["cs3000", "softwareB", "softwareC", "khoury1"],
    schoolScope: ["Northeastern University", "Columbia University", ANY_SCHOOL],
  },
  {
    id: "signal-ml-platform-coop",
    title: "ML Platform Co-op",
    company: "Signal Labs",
    location: "New York, NY",
    termLabel: "July-December 2026",
    termStartId: "2026-summer2",
    termEndId: "2026-fall",
    summary:
      "Help the ML platform team productionize model pipelines, data validation, and internal tooling that supports fast iteration across research and product.",
    focusAreas: ["ML infrastructure", "Data systems", "Internal tools"],
    preferredCourseIds: ["ds3000", "cs3000", "softwareB", "eece2310"],
    schoolScope: ["Columbia University", ANY_SCHOOL],
  },
  {
    id: "northstar-systems-coop",
    title: "Systems Software Co-op",
    company: "Northstar Robotics",
    location: "Cambridge, MA",
    termLabel: "January-June 2027",
    termStartId: "2027-spring",
    termEndId: "2027-summer1",
    summary:
      "Build performance-critical services and integration tooling for robotics software stacks, with an emphasis on debugging, reliability, and low-level reasoning.",
    focusAreas: ["Systems", "Performance", "Infrastructure"],
    preferredCourseIds: ["cs3650", "cs3800", "cs3000", "softwareD"],
    schoolScope: ["Northeastern University", ANY_SCHOOL],
  },
  {
    id: "meridian-devx-coop",
    title: "Developer Experience Co-op",
    company: "Meridian Commerce",
    location: "New York, NY",
    termLabel: "July-December 2027",
    termStartId: "2027-summer2",
    termEndId: "2027-fall",
    summary:
      "Improve local development workflows, testing reliability, and engineering productivity systems across a large commerce platform.",
    focusAreas: ["Developer experience", "Tooling", "Quality systems"],
    preferredCourseIds: ["softwareB", "softwareC", "presentation", "cs3650"],
    schoolScope: ["Columbia University", "Northeastern University", ANY_SCHOOL],
  },
];

export function buildOpportunitySuggestions(
  profile: StudentProfile,
): OpportunitySuggestion[] {
  const completedOrInProgress = new Set([
    ...profile.completedCourseIds,
    ...profile.inProgressCourseIds,
  ]);

  return SEEDED_OPPORTUNITIES.filter((opportunity) =>
    opportunity.schoolScope.includes(ANY_SCHOOL) ||
    opportunity.schoolScope.includes(profile.school),
  )
    .map((opportunity) => {
      const matchedCourseCodes = opportunity.preferredCourseIds
        .filter((courseId) => completedOrInProgress.has(courseId))
        .map((courseId) => COURSE_MAP[courseId]?.code ?? courseId);

      const missingCourseCodes = opportunity.preferredCourseIds
        .filter((courseId) => !completedOrInProgress.has(courseId))
        .slice(0, 2)
        .map((courseId) => COURSE_MAP[courseId]?.code ?? courseId);

      const schoolBonus = opportunity.schoolScope.includes(profile.school) ? 16 : 8;
      const fitScore = Math.min(
        99,
        50 + matchedCourseCodes.length * 11 + schoolBonus - missingCourseCodes.length * 3,
      );

      return {
        ...opportunity,
        fitScore,
        matchedCourseCodes,
        missingCourseCodes,
      };
    })
    .sort((left, right) => right.fitScore - left.fitScore);
}
