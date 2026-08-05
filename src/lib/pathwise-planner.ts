import {
  ACADEMIC_TERMS,
  COURSE_MAP,
  COURSE_REQUIREMENTS,
  TOTAL_DEGREE_CREDITS,
  getTermIndex,
  getTermPattern,
  nextAcademicTerm,
} from "@/lib/pathwise-data";
import type {
  AcademicTerm,
  CourseRequirement,
  DerivedTerm,
  PlannerSnapshot,
  PlannerState,
  ScheduledCourse,
  SpecialBlockType,
  StudentProfile,
} from "@/lib/pathwise-types";

function getNormalCapacity(term: AcademicTerm) {
  return term.kind === "fall" || term.kind === "spring" ? 4 : 2;
}

function compareCourseOrder(left: CourseRequirement, right: CourseRequirement) {
  const termDelta = getTermIndex(left.baselineTermId) - getTermIndex(right.baselineTermId);
  if (termDelta !== 0) return termDelta;
  return left.order - right.order;
}

function getBaseCapacity(term: AcademicTerm, block?: SpecialBlockType) {
  const normalCapacity = getNormalCapacity(term);
  if (block === "work-term" || block === "time-off") return 0;
  if (block === "internship") return Math.max(1, Math.floor(normalCapacity / 2));
  return normalCapacity;
}

function getHardCapacity(term: AcademicTerm, block?: SpecialBlockType) {
  const baseCapacity = getBaseCapacity(term, block);
  if (baseCapacity === 0) return 0;
  return baseCapacity + 1;
}

function getCredits(courseIds: string[]) {
  return courseIds.reduce((sum, courseId) => sum + (COURSE_MAP[courseId]?.credits ?? 0), 0);
}

function buildLockedTerms(profile: StudentProfile) {
  const lockedThroughIndex = getTermIndex(profile.lockedThroughTermId);
  const completed = new Set(profile.completedCourseIds);
  const inProgress = new Set(profile.inProgressCourseIds);

  const lockedTerms: DerivedTerm[] = ACADEMIC_TERMS.slice(0, lockedThroughIndex + 1).map(
    (term) => {
      const courses = COURSE_REQUIREMENTS.filter((course) => course.baselineTermId === term.id)
        .filter((course) => completed.has(course.id) || inProgress.has(course.id))
        .map<ScheduledCourse>((course) => ({
          ...course,
          termId: term.id,
          status: completed.has(course.id) ? "completed" : "in-progress",
          pinned: false,
          conflicts: [],
        }));

      return {
        term,
        courses,
        credits: courses.reduce((sum, course) => sum + course.credits, 0),
        baseCapacity: getNormalCapacity(term),
        hardCapacity: getNormalCapacity(term) + 1,
        overload: false,
        locked: true,
        specialBlock: undefined,
        warnings:
          courses.some((course) => course.status === "in-progress")
            ? ["In-progress work is assumed to land successfully."]
            : [],
      };
    },
  );

  const courseTermMap = new Map<string, string>();
  lockedTerms.forEach((term) => {
    term.courses.forEach((course) => {
      courseTermMap.set(course.id, term.term.id);
    });
  });

  return {
    lockedThroughIndex,
    lockedTerms,
    lockedCoursePlacements: courseTermMap,
  };
}

function canAutoPlaceCourse(
  course: CourseRequirement,
  term: AcademicTerm,
  scheduledPlacements: Map<string, string>,
) {
  const termIndex = getTermIndex(term.id);
  const baselineIndex = getTermIndex(course.baselineTermId);

  if (termIndex < baselineIndex) return false;
  if (!course.allowedTerms.includes(getTermPattern(term.kind))) return false;

  return course.prereqs.every((prereqId) => {
    const prereqTermId = scheduledPlacements.get(prereqId);
    if (!prereqTermId) return false;
    return getTermIndex(prereqTermId) < termIndex;
  });
}

function buildConflictMessages(
  course: CourseRequirement,
  term: AcademicTerm,
  scheduledPlacements: Map<string, string>,
) {
  const conflicts: string[] = [];
  const termPattern = getTermPattern(term.kind);
  const termIndex = getTermIndex(term.id);
  const baselineIndex = getTermIndex(course.baselineTermId);

  if (!course.allowedTerms.includes(termPattern)) {
    conflicts.push("Modeled as not normally offered in this term.");
  }

  if (termIndex < baselineIndex) {
    conflicts.push("Pulled earlier than the modeled degree path.");
  }

  course.prereqs.forEach((prereqId) => {
    const prereq = COURSE_MAP[prereqId];
    const prereqTermId = scheduledPlacements.get(prereqId);

    if (!prereqTermId || getTermIndex(prereqTermId) >= termIndex) {
      conflicts.push(`Prerequisite timing issue: ${prereq.code}.`);
    }
  });

  return conflicts;
}

function scheduleFutureTerms(
  profile: StudentProfile,
  state: PlannerState,
  lockedPlacements: Map<string, string>,
) {
  const completedOrActive = new Set([
    ...profile.completedCourseIds,
    ...profile.inProgressCourseIds,
  ]);

  const pinnedTargets = new Map<string, string>();
  Object.entries(state.pinnedCourses).forEach(([courseId, termId]) => {
    if (termId && !completedOrActive.has(courseId)) pinnedTargets.set(courseId, termId);
  });

  const plannedCourses = COURSE_REQUIREMENTS.filter(
    (course) => !completedOrActive.has(course.id),
  ).sort(compareCourseOrder);

  const firstFutureIndex = getTermIndex(profile.lockedThroughTermId) + 1;
  let workingTerms = [...ACADEMIC_TERMS.slice(firstFutureIndex)];

  const scheduleAcrossTerms = (terms: AcademicTerm[]) => {
    const placements = new Map(lockedPlacements);
    const futureByTerm = new Map<string, ScheduledCourse[]>();
    const queue = plannedCourses.filter((course) => !pinnedTargets.has(course.id));

    for (const term of terms) {
      const specialBlock = state.placedBlocks[term.id]?.type;
      const baseCapacity = getBaseCapacity(term, specialBlock);
      const pinnedHere = plannedCourses
        .filter((course) => pinnedTargets.get(course.id) === term.id)
        .sort(compareCourseOrder);
      const scheduledHere: ScheduledCourse[] = [];

      pinnedHere.forEach((course) => {
        placements.set(course.id, term.id);
      });

      pinnedHere.forEach((course) => {
        scheduledHere.push({
          ...course,
          termId: term.id,
          status: "planned",
          pinned: true,
          conflicts: buildConflictMessages(course, term, placements),
        });
      });

      const fillSlots = Math.max(baseCapacity - pinnedHere.length, 0);

      for (let slot = 0; slot < fillSlots; slot += 1) {
        const nextIndex = queue.findIndex((course) =>
          canAutoPlaceCourse(course, term, placements),
        );

        if (nextIndex === -1) break;

        const [course] = queue.splice(nextIndex, 1);
        placements.set(course.id, term.id);
        scheduledHere.push({
          ...course,
          termId: term.id,
          status: "planned",
          pinned: false,
          conflicts: [],
        });
      }

      futureByTerm.set(term.id, scheduledHere);
    }

    return {
      futureByTerm,
      placements,
      remainingQueue: queue,
    };
  };

  let scheduled = scheduleAcrossTerms(workingTerms);
  let extensionCount = 0;

  while (scheduled.remainingQueue.length > 0 && extensionCount < 8) {
    workingTerms = [...workingTerms, nextAcademicTerm(workingTerms[workingTerms.length - 1])];
    scheduled = scheduleAcrossTerms(workingTerms);
    extensionCount += 1;
  }

  return {
    terms: workingTerms,
    futureByTerm: scheduled.futureByTerm,
    placements: scheduled.placements,
    unfinishedCourses: scheduled.remainingQueue,
  };
}

export function derivePlannerSnapshot(
  profile: StudentProfile,
  state: PlannerState,
): PlannerSnapshot {
  const locked = buildLockedTerms(profile);
  const future = scheduleFutureTerms(profile, state, locked.lockedCoursePlacements);

  const futureTerms: DerivedTerm[] = future.terms.map((term) => {
    const specialBlock = state.placedBlocks[term.id]?.type;
    const baseCapacity = getBaseCapacity(term, specialBlock);
    const hardCapacity = getHardCapacity(term, specialBlock);
    const courses = future.futureByTerm.get(term.id) ?? [];
    const overload = baseCapacity > 0 && courses.length > baseCapacity;
    const warnings: string[] = [];

    if (overload) warnings.push("Overload: one extra course above the default load.");
    if (specialBlock === "work-term") warnings.push("Academic coursework pauses during this work term.");
    if (specialBlock === "internship") warnings.push("Internship mode limits the modeled academic load.");
    if (specialBlock === "time-off") warnings.push("Time off pushes remaining requirements later.");

    return {
      term,
      courses,
      credits: courses.reduce((sum, course) => sum + course.credits, 0),
      baseCapacity,
      hardCapacity,
      overload,
      locked: false,
      specialBlock,
      warnings,
    };
  });

  const allTerms = [...locked.lockedTerms, ...futureTerms];
  const lastCourseTerm =
    [...allTerms].reverse().find((term) => term.courses.length > 0)?.term ??
    allTerms[allTerms.length - 1].term;
  const lastBlockTerm =
    [...allTerms].reverse().find((term) => term.specialBlock)?.term ?? lastCourseTerm;
  const lastRelevantIndex = Math.max(
    getTermIndex(lastCourseTerm.id),
    getTermIndex(lastBlockTerm.id),
    locked.lockedThroughIndex + 4,
  );
  const visibleTerms = allTerms.filter((term) => getTermIndex(term.term.id) <= lastRelevantIndex);

  const warnings = new Set<string>();

  visibleTerms.forEach((term) => {
    term.warnings.forEach((warning) => warnings.add(`${term.term.label}: ${warning}`));
    term.courses.forEach((course) => {
      course.conflicts.forEach((conflict) =>
        warnings.add(`${course.code} in ${term.term.label}: ${conflict}`),
      );
    });
  });

  if (future.unfinishedCourses.length > 0) {
    warnings.add("The current horizon ran out of room before every requirement could be placed.");
  }

  const satisfiedCredits = getCredits(profile.completedCourseIds);
  const inProgressCredits = getCredits(profile.inProgressCourseIds);
  const plannedCredits = visibleTerms
    .flatMap((term) => term.courses)
    .filter((course) => course.status === "planned")
    .reduce((sum, course) => sum + course.credits, 0);

  const projectedGraduation =
    [...visibleTerms].reverse().find((term) => term.courses.length > 0)?.term.label ??
    profile.targetGraduation;

  return {
    terms: visibleTerms,
    satisfiedCredits,
    inProgressCredits,
    plannedCredits,
    totalCredits: TOTAL_DEGREE_CREDITS,
    projectedGraduation,
    warnings: [...warnings],
  };
}
