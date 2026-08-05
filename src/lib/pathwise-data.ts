import type {
  AcademicTerm,
  CourseRequirement,
  PlannerState,
  StudentProfile,
  TermKind,
  TermPattern,
} from "@/lib/pathwise-types";

export const TOTAL_DEGREE_CREDITS = 135;
export const STORAGE_KEY = "pathwise-session-v1";

function makeTerm(year: number, kind: TermKind): AcademicTerm {
  const labels: Record<TermKind, string> = {
    fall: `Fall ${year}`,
    spring: `Spring ${year}`,
    summer1: `Summer 1 ${year}`,
    summer2: `Summer 2 ${year}`,
  };

  return {
    id: `${year}-${kind}`,
    label: labels[kind],
    kind,
    year,
  };
}

export const ACADEMIC_TERMS: AcademicTerm[] = [
  makeTerm(2023, "fall"),
  makeTerm(2024, "spring"),
  makeTerm(2024, "summer1"),
  makeTerm(2024, "summer2"),
  makeTerm(2024, "fall"),
  makeTerm(2025, "spring"),
  makeTerm(2025, "summer1"),
  makeTerm(2025, "summer2"),
  makeTerm(2025, "fall"),
  makeTerm(2026, "spring"),
  makeTerm(2026, "summer1"),
  makeTerm(2026, "summer2"),
  makeTerm(2026, "fall"),
  makeTerm(2027, "spring"),
  makeTerm(2027, "summer1"),
  makeTerm(2027, "summer2"),
  makeTerm(2027, "fall"),
  makeTerm(2028, "spring"),
];

function course(
  id: string,
  code: string,
  title: string,
  requirement: string,
  credits: number,
  bucket: CourseRequirement["bucket"],
  allowedTerms: TermPattern[],
  prereqs: string[],
  baselineTermId: string,
  order: number,
): CourseRequirement {
  return {
    id,
    code,
    title,
    requirement,
    credits,
    bucket,
    allowedTerms,
    prereqs,
    baselineTermId,
    order,
  };
}

export const COURSE_REQUIREMENTS: CourseRequirement[] = [
  course(
    "cs1200",
    "CS 1200",
    "First Year Seminar",
    "Computer science overview",
    1,
    "career",
    ["fall"],
    [],
    "2023-fall",
    1,
  ),
  course(
    "cs1800",
    "CS 1800/1802",
    "Discrete Structures + Seminar",
    "Computer science fundamentals",
    5,
    "foundation",
    ["fall", "spring"],
    [],
    "2023-fall",
    2,
  ),
  course(
    "cs2000",
    "CS 2000/2001",
    "Intro to Program Design + Lab",
    "Computer science fundamentals",
    5,
    "foundation",
    ["fall", "spring"],
    [],
    "2023-fall",
    3,
  ),
  course(
    "engw1111",
    "ENGW 1111",
    "First-Year Writing",
    "Writing requirement",
    4,
    "career",
    ["fall", "spring"],
    [],
    "2023-fall",
    4,
  ),
  course(
    "math1365",
    "MATH 1365",
    "Introduction to Mathematical Reasoning",
    "Supporting mathematics",
    4,
    "foundation",
    ["fall", "spring"],
    [],
    "2023-fall",
    5,
  ),
  course(
    "cs2100",
    "CS 2100/2101",
    "Program Design and Implementation 1 + Lab",
    "Computer science fundamentals",
    5,
    "foundation",
    ["spring"],
    ["cs2000"],
    "2024-spring",
    6,
  ),
  course(
    "math1341",
    "MATH 1341",
    "Calculus 1 for Science and Engineering",
    "Supporting mathematics",
    4,
    "foundation",
    ["fall", "spring"],
    [],
    "2024-spring",
    7,
  ),
  course(
    "science1",
    "SCIENCE I",
    "Science Requirement I",
    "Science requirement",
    4,
    "systems",
    ["fall", "spring"],
    [],
    "2024-spring",
    8,
  ),
  course(
    "genA",
    "GEN EL 1",
    "General Elective",
    "General electives",
    4,
    "open",
    ["fall", "spring"],
    [],
    "2024-spring",
    9,
  ),
  course(
    "cs3000",
    "CS 3000",
    "Algorithms and Data",
    "Computer science required course",
    4,
    "systems",
    ["fall", "spring", "summer"],
    ["cs2100"],
    "2024-summer1",
    10,
  ),
  course(
    "genB",
    "GEN EL 2",
    "General Elective",
    "General electives",
    4,
    "open",
    ["summer", "fall", "spring"],
    [],
    "2024-summer1",
    11,
  ),
  course(
    "genC",
    "GEN EL 3",
    "General Elective",
    "General electives",
    4,
    "open",
    ["summer", "fall", "spring"],
    [],
    "2024-summer2",
    12,
  ),
  course(
    "genD",
    "GEN EL 4",
    "General Elective",
    "General electives",
    4,
    "open",
    ["summer", "fall", "spring"],
    [],
    "2024-summer2",
    13,
  ),
  course(
    "cs3100",
    "CS 3100/3101",
    "Program Design and Implementation 2 + Lab",
    "Computer science required course",
    5,
    "foundation",
    ["fall", "spring"],
    ["cs2100"],
    "2024-fall",
    14,
  ),
  course(
    "ds3000",
    "DS 3000",
    "Foundations of Data Science",
    "Computer science required course",
    4,
    "systems",
    ["fall", "spring"],
    ["cs2100"],
    "2024-fall",
    15,
  ),
  course(
    "softwareA",
    "CS 2800",
    "Logic and Computation",
    "Software concentration",
    4,
    "software",
    ["fall", "spring"],
    ["cs2100"],
    "2024-fall",
    16,
  ),
  course(
    "science2",
    "SCIENCE II",
    "Science Requirement II",
    "Science requirement",
    4,
    "systems",
    ["fall", "spring"],
    [],
    "2024-fall",
    17,
  ),
  course(
    "cs1210",
    "CS 1210",
    "Professional Development for Khoury Co-op",
    "Computer science overview",
    1,
    "career",
    ["spring"],
    [],
    "2025-spring",
    18,
  ),
  course(
    "cs3650",
    "CS 3650",
    "Computer Systems",
    "Computer science required course",
    4,
    "systems",
    ["fall", "spring"],
    ["cs3000", "cs3100"],
    "2025-spring",
    19,
  ),
  course(
    "softwareB",
    "CS 4400",
    "Programming Languages",
    "Software concentration",
    4,
    "software",
    ["spring", "fall"],
    ["softwareA", "cs3100"],
    "2025-spring",
    20,
  ),
  course(
    "khoury1",
    "KHOURY EL 1",
    "Khoury Approved Elective",
    "Khoury approved elective",
    4,
    "open",
    ["fall", "spring"],
    ["cs3100"],
    "2025-spring",
    21,
  ),
  course(
    "presentation",
    "COMM 1112",
    "Public Speaking",
    "Presentation requirement",
    4,
    "career",
    ["fall", "spring"],
    [],
    "2025-spring",
    22,
  ),
  course(
    "eece2310",
    "EECE 2310/2311",
    "Digital Design and Computer Architecture + Lab",
    "Electrical engineering supporting course",
    5,
    "systems",
    ["summer", "fall"],
    ["cs2100"],
    "2025-summer1",
    23,
  ),
  course(
    "genE",
    "GEN EL 5",
    "General Elective",
    "General electives",
    4,
    "open",
    ["summer", "fall", "spring"],
    [],
    "2025-summer1",
    24,
  ),
  course(
    "cs3800",
    "CS 3800",
    "Theory of Computation",
    "Computer science required course",
    4,
    "systems",
    ["fall", "spring"],
    ["cs3000", "cs3100"],
    "2025-fall",
    25,
  ),
  course(
    "social",
    "DS 1300",
    "Knowledge in a Digital World",
    "Computing and social issues",
    4,
    "career",
    ["fall", "spring"],
    [],
    "2025-fall",
    26,
  ),
  course(
    "softwareC",
    "CS 4700",
    "Network Fundamentals",
    "Software concentration",
    4,
    "software",
    ["fall"],
    ["cs3650"],
    "2025-fall",
    27,
  ),
  course(
    "softwareD",
    "CS 4820",
    "Database Design",
    "Software concentration",
    4,
    "software",
    ["fall", "spring"],
    ["cs3100"],
    "2025-fall",
    28,
  ),
  course(
    "engw3302",
    "ENGW 3302",
    "Advanced Writing in Technical Professions",
    "Writing requirement",
    4,
    "career",
    ["spring", "summer"],
    ["engw1111"],
    "2026-spring",
    29,
  ),
  course(
    "security",
    "CY 2550",
    "Foundations of Cybersecurity",
    "Security requirement",
    4,
    "capstone",
    ["spring"],
    ["cs3650"],
    "2026-spring",
    30,
  ),
  course(
    "khoury2",
    "KHOURY EL 2",
    "Khoury Approved Elective",
    "Khoury approved elective",
    4,
    "open",
    ["fall", "spring"],
    ["cs3100"],
    "2026-spring",
    31,
  ),
  course(
    "genF",
    "GEN EL 6",
    "General Elective",
    "General electives",
    4,
    "open",
    ["fall", "spring"],
    [],
    "2026-spring",
    32,
  ),
  course(
    "genG",
    "GEN EL 7",
    "General Elective",
    "General electives",
    4,
    "open",
    ["summer", "fall", "spring"],
    [],
    "2026-summer1",
    33,
  ),
  course(
    "cs4530",
    "CS 4530",
    "Fundamentals of Software Engineering",
    "Capstone requirement",
    4,
    "capstone",
    ["spring"],
    ["softwareC", "softwareD", "cs3800"],
    "2027-spring",
    34,
  ),
];

export const COURSE_MAP = Object.fromEntries(
  COURSE_REQUIREMENTS.map((requirement) => [requirement.id, requirement]),
) as Record<string, CourseRequirement>;

const SOPHOMORE_COMPLETED = [
  "cs1200",
  "cs1800",
  "cs2000",
  "engw1111",
  "math1365",
  "cs2100",
  "math1341",
  "science1",
  "genA",
  "cs3000",
  "genB",
  "genC",
  "genD",
  "cs3100",
  "ds3000",
  "softwareA",
  "science2",
];

const SPRING_2025_IN_PROGRESS = [
  "cs1210",
  "cs3650",
  "softwareB",
  "khoury1",
  "presentation",
];

const SUMMER_2025_IN_PROGRESS = ["eece2310", "genE"];

export const DEMO_PROFILES: Record<string, Omit<StudentProfile, "uploadedAt" | "uploadedFileName">> =
  {
    sophomore: {
      id: "caroline-sophomore",
      label: "Caroline Hughes · sophomore snapshot",
      school: "Northeastern University",
      program: "BSCS · Software concentration",
      startYear: 2023,
      targetGraduation: "Spring 2027",
      openToGraduation: "Spring 2028",
      lockedThroughTermId: "2025-spring",
      completedCourseIds: SOPHOMORE_COMPLETED,
      inProgressCourseIds: SPRING_2025_IN_PROGRESS,
      parserNote:
        "Mapped to the seeded Northeastern BSCS sophomore profile. This is the default Pathwise planning state.",
    },
    inProgress: {
      id: "caroline-in-progress",
      label: "Caroline Hughes · summer build-out",
      school: "Northeastern University",
      program: "BSCS · Software concentration",
      startYear: 2023,
      targetGraduation: "Spring 2027",
      openToGraduation: "Spring 2028",
      lockedThroughTermId: "2025-summer1",
      completedCourseIds: [...SOPHOMORE_COMPLETED, ...SPRING_2025_IN_PROGRESS],
      inProgressCourseIds: SUMMER_2025_IN_PROGRESS,
      parserNote:
        "Mapped to the seeded Northeastern BSCS profile with Summer 1 2025 already underway.",
    },
  };

export const DEFAULT_PLANNER_STATE: PlannerState = {
  placedBlocks: {},
  pinnedCourses: {},
};

export const REQUIREMENTS_URL =
  "https://catalog.northeastern.edu/undergraduate/computer-information-science/computer-science/bscs/#SFTW";

function withUploadMetadata(
  profile: Omit<StudentProfile, "uploadedAt" | "uploadedFileName">,
  fileName: string,
  parserNote: string,
) {
  return {
    ...profile,
    uploadedFileName: fileName,
    uploadedAt: new Date().toISOString(),
    parserNote,
  };
}

export function buildProfileFromUpload(fileName: string, text: string) {
  const normalizedName = fileName.toLowerCase();
  const normalizedText = text.toLowerCase();

  if (
    normalizedName.includes("in-progress") ||
    normalizedText.includes("january 13, 2025") ||
    normalizedText.includes("summer 1 2025")
  ) {
    return withUploadMetadata(
      DEMO_PROFILES.inProgress,
      fileName,
      "Matched the upload to the seeded Northeastern in-progress transcript shape.",
    );
  }

  if (
    normalizedName.includes("sophomore") ||
    normalizedText.includes("may 22, 2025") ||
    normalizedText.includes("spring 2025")
  ) {
    return withUploadMetadata(
      DEMO_PROFILES.sophomore,
      fileName,
      "Matched the upload to the seeded Northeastern sophomore transcript shape.",
    );
  }

  return withUploadMetadata(
    DEMO_PROFILES.sophomore,
    fileName,
    "Processed the PDF, but the MVP could not map it precisely. Pathwise fell back to the seeded Northeastern sophomore profile.",
  );
}

export function getTermIndex(termId: string) {
  return ACADEMIC_TERMS.findIndex((term) => term.id === termId);
}

export function getTermPattern(kind: TermKind): TermPattern {
  if (kind === "fall") return "fall";
  if (kind === "spring") return "spring";
  return "summer";
}

export function nextAcademicTerm(term: AcademicTerm): AcademicTerm {
  if (term.kind === "fall") return makeTerm(term.year + 1, "spring");
  if (term.kind === "spring") return makeTerm(term.year, "summer1");
  if (term.kind === "summer1") return makeTerm(term.year, "summer2");
  return makeTerm(term.year, "fall");
}
