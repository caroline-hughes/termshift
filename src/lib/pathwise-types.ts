export type TermKind = "fall" | "spring" | "summer1" | "summer2";
export type TermPattern = "fall" | "spring" | "summer";
export type CourseBucket =
  | "foundation"
  | "systems"
  | "career"
  | "software"
  | "open"
  | "capstone";
export type SpecialBlockType = "work-term" | "internship" | "time-off";
export type CourseStatus = "completed" | "in-progress" | "planned";

export interface AcademicTerm {
  id: string;
  label: string;
  kind: TermKind;
  year: number;
}

export interface CourseRequirement {
  id: string;
  code: string;
  title: string;
  requirement: string;
  credits: number;
  bucket: CourseBucket;
  allowedTerms: TermPattern[];
  prereqs: string[];
  baselineTermId: string;
  order: number;
}

export interface StudentProfile {
  id: string;
  label: string;
  school: string;
  program: string;
  startYear: number;
  targetGraduation: string;
  openToGraduation: string;
  lockedThroughTermId: string;
  completedCourseIds: string[];
  inProgressCourseIds: string[];
  parserNote: string;
  uploadedFileName: string;
  uploadedAt: string;
}

export interface PlacedBlock {
  groupId: string;
  label?: string;
  type: SpecialBlockType;
}

export interface PlannerState {
  placedBlocks: Record<string, PlacedBlock | undefined>;
  pinnedCourses: Record<string, string | undefined>;
}

export interface ScheduledCourse extends CourseRequirement {
  termId: string;
  status: CourseStatus;
  pinned: boolean;
  conflicts: string[];
}

export interface DerivedTerm {
  term: AcademicTerm;
  courses: ScheduledCourse[];
  credits: number;
  baseCapacity: number;
  hardCapacity: number;
  overload: boolean;
  locked: boolean;
  specialBlock?: SpecialBlockType;
  warnings: string[];
}

export interface PlannerSnapshot {
  terms: DerivedTerm[];
  satisfiedCredits: number;
  inProgressCredits: number;
  plannedCredits: number;
  totalCredits: number;
  projectedGraduation: string;
  warnings: string[];
}

export interface SavedSession {
  profile: StudentProfile;
  plannerState: PlannerState;
}
