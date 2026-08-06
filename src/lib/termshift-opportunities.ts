import { COURSE_MAP } from "@/lib/pathwise-data";
import type { StudentProfile } from "@/lib/pathwise-types";

export type WorkOpportunity = {
  company: string;
  compensation?: string;
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
    compensation: "$28-$32/hr",
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
    compensation: "$24-$28/hr",
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
    compensation: "$30-$35/hr",
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
    compensation: "$27-$31/hr",
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
    compensation: "$26-$30/hr",
    focusAreas: ["Developer experience", "Tooling", "Quality systems"],
    preferredCourseIds: ["softwareB", "softwareC", "presentation", "cs3650"],
    schoolScope: ["Columbia University", "Northeastern University", ANY_SCHOOL],
  },
  {
    id: "heliux-software-intern",
    title: "Software Engineer Internship",
    company: "Heliux",
    location: "San Francisco, CA",
    termLabel: "January-June 2027",
    termStartId: "2027-spring",
    termEndId: "2027-summer1",
    summary:
      "Build software for an AI-native manufacturing platform spanning operational workflows, internal tools, and scalable product systems.",
    compensation: "Competitive",
    focusAreas: ["Manufacturing software", "Rust/Python", "Platform systems"],
    preferredCourseIds: ["cs3000", "cs3100", "cs3650", "softwareB"],
    schoolScope: [ANY_SCHOOL],
  },
  {
    id: "amazon-robotics-sde-coop",
    title: "Robotics Software Development Engineer Intern/Co-op",
    company: "Amazon",
    location: "Sunnyvale, CA",
    termLabel: "July-December 2026",
    termStartId: "2026-summer2",
    termEndId: "2026-fall",
    summary:
      "Join an Amazon Robotics team to design distributed services, cloud-connected robotics software, and production systems that support fulfillment technologies.",
    compensation: "Varies by team/location",
    focusAreas: ["Robotics", "Distributed systems", "Cloud services"],
    preferredCourseIds: ["cs3000", "cs3100", "cs3650", "eece2310"],
    schoolScope: [ANY_SCHOOL],
  },
  {
    id: "nvidia-dynamo-fall-intern",
    title: "Software Engineering Intern, Dynamo",
    company: "NVIDIA AI",
    location: "Santa Clara, CA",
    termLabel: "July-December 2026",
    termStartId: "2026-summer2",
    termEndId: "2026-fall",
    summary:
      "Work on distributed inference infrastructure, GPU scheduling, and open-source systems for large-model serving on the Dynamo team.",
    compensation: "$20-$71/hr",
    focusAreas: ["AI infrastructure", "Rust/Python", "Distributed inference"],
    preferredCourseIds: ["cs3000", "cs3650", "softwareB", "softwareC"],
    schoolScope: [ANY_SCHOOL],
  },
  {
    id: "zipline-fall-software-intern",
    title: "Software Engineer Intern",
    company: "Zipline",
    location: "South San Francisco, CA",
    termLabel: "July-December 2026",
    termStartId: "2026-summer2",
    termEndId: "2026-fall",
    summary:
      "Ship production software that supports autonomous logistics systems, backend platform services, and operational tooling used by robotics teams.",
    compensation: "$54/hr",
    focusAreas: ["Backend systems", "Autonomy platform", "Operations tooling"],
    preferredCourseIds: ["cs3000", "cs3650", "softwareB", "eece2310"],
    schoolScope: [ANY_SCHOOL],
  },
  {
    id: "notion-fall-software-intern",
    title: "Software Engineer Intern",
    company: "Notion",
    location: "San Francisco, CA",
    termLabel: "July-December 2026",
    termStartId: "2026-summer2",
    termEndId: "2026-fall",
    summary:
      "Contribute to collaborative product surfaces and the systems behind them, with work spanning full-stack features, performance, and developer velocity.",
    compensation: "Competitive",
    focusAreas: ["Product engineering", "Full-stack", "Collaboration tools"],
    preferredCourseIds: ["cs3000", "softwareB", "softwareD", "presentation"],
    schoolScope: [ANY_SCHOOL],
  },
  {
    id: "cohere-fall-winter-intern",
    title: "Software Engineer Intern",
    company: "Cohere",
    location: "New York, NY",
    termLabel: "July-December 2026",
    termStartId: "2026-summer2",
    termEndId: "2026-fall",
    summary:
      "Build infrastructure and product systems around large-language-model APIs, model-serving reliability, and security-minded platform engineering.",
    compensation: "Competitive",
    focusAreas: ["LLM platform", "API infrastructure", "Security features"],
    preferredCourseIds: ["cs3000", "ds3000", "softwareB", "softwareD"],
    schoolScope: ["Columbia University", ANY_SCHOOL],
  },
  {
    id: "asm-spring-software-intern",
    title: "Software Engineering Intern",
    company: "ASM International",
    location: "Phoenix, AZ",
    termLabel: "January-June 2027",
    termStartId: "2027-spring",
    termEndId: "2027-summer1",
    summary:
      "Support engineering software used in semiconductor workflows, with hands-on work in internal tooling, application features, and test-oriented development.",
    compensation: "Competitive",
    focusAreas: ["Engineering software", "Application development", "Testing"],
    preferredCourseIds: ["cs3000", "softwareB", "softwareD", "science2"],
    schoolScope: [ANY_SCHOOL],
  },
  {
    id: "bmw-quality-software-intern",
    title: "Quality Software Intern",
    company: "BMW",
    location: "Spartanburg, SC",
    termLabel: "January-June 2027",
    termStartId: "2027-spring",
    termEndId: "2027-summer1",
    summary:
      "Work on software quality workflows, automation, and process improvements in an engineering environment with strong ownership for student projects.",
    compensation: "Not listed",
    focusAreas: ["Quality systems", "Automation", "Process tooling"],
    preferredCourseIds: ["cs3000", "softwareB", "presentation", "ds3000"],
    schoolScope: [ANY_SCHOOL],
  },
  {
    id: "hermeus-modeling-sim-intern",
    title: "Software Engineering Intern (Modeling & Simulation)",
    company: "Hermeus",
    location: "Atlanta, GA",
    termLabel: "July-December 2026",
    termStartId: "2026-summer2",
    termEndId: "2026-fall",
    summary:
      "Develop performant simulation and modeling software with an emphasis on systems thinking, performance tuning, and mission-critical engineering workflows.",
    compensation: "$25-$33/hr",
    focusAreas: ["Simulation", "Performance", "Systems software"],
    preferredCourseIds: ["cs3650", "cs3800", "eece2310", "softwareC"],
    schoolScope: [ANY_SCHOOL],
  },
  {
    id: "nvidia-jax-fall-intern",
    title: "Software Engineering Intern, JAX",
    company: "NVIDIA",
    location: "Santa Clara, CA",
    termLabel: "July-December 2026",
    termStartId: "2026-summer2",
    termEndId: "2026-fall",
    summary:
      "Help build customer-facing AI and scientific computing systems around JAX workloads, scalable infrastructure, and research-adjacent product engineering.",
    compensation: "Competitive",
    focusAreas: ["Scientific computing", "AI systems", "Python infrastructure"],
    preferredCourseIds: ["cs3000", "ds3000", "softwareB", "cs3800"],
    schoolScope: [ANY_SCHOOL],
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
