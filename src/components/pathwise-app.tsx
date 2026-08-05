"use client";

import {
	Fragment,
	useEffect,
	useState,
	type DragEvent,
	type MouseEvent as ReactMouseEvent,
} from "react";
import {
	ACADEMIC_TERMS,
	DEMO_PROFILES,
	DEFAULT_PLANNER_STATE,
	TOTAL_DEGREE_CREDITS,
	getTermIndex,
} from "@/lib/pathwise-data";
import { derivePlannerSnapshot } from "@/lib/pathwise-planner";
import type {
	CourseBucket,
	DerivedTerm,
	PlacedBlock,
	PlannerState,
	ScheduledCourse,
	SpecialBlockType,
	StudentProfile,
	TermKind,
} from "@/lib/pathwise-types";

type ActiveView = "profile" | "path-plan";
type ResizeEdge = "start" | "end";

type DragPayload =
	| { type: "course"; courseId: string }
	| { type: "block"; blockType: SpecialBlockType }
	| { anchorOffset: number; groupId: string; type: "move-block" }
	| { type: "resize-block"; edge: ResizeEdge; groupId: string };

type YearRow = {
	key: number;
	label: string;
	terms: Partial<Record<TermKind, DerivedTerm>>;
};

type BlockGroup = {
	endTermId: string;
	groupId: string;
	startTermId: string;
	termIds: string[];
	type: SpecialBlockType;
};

type BlockContextMenu = {
	groupId: string;
	x: number;
	y: number;
} | null;

const PLAN_STORAGE_KEY = "pathwise-saved-plan-v3";

const TERM_ORDER: TermKind[] = ["fall", "spring", "summer1", "summer2"];

const TERM_LABELS: Record<TermKind, string> = {
	fall: "Fall",
	spring: "Spring",
	summer1: "Summer 1",
	summer2: "Summer 2",
};

const BLOCK_LABELS: Record<SpecialBlockType, string> = {
	"work-term": "Co-op",
	internship: "Internship",
	"time-off": "Time Off",
};

const BLOCK_TONES: Record<SpecialBlockType, string> = {
	"work-term": "block-chip--deep-indigo",
	internship: "block-chip--dusky-plum",
	"time-off": "block-chip--slate-grey",
};

const PLACED_BLOCK_TONES: Record<SpecialBlockType, string> = {
	"work-term": "placed-block--deep-indigo",
	internship: "placed-block--dusky-plum",
	"time-off": "placed-block--slate-grey",
};

const COURSE_TONES: Record<CourseBucket, string> = {
	foundation: "course-box--deep-indigo",
	systems: "course-box--slate-grey",
	career: "course-box--harbor-teal",
	software: "course-box--dusky-plum",
	open: "course-box--blue-slate",
	capstone: "course-box--mulberry",
};

function createDemoProfile(): StudentProfile {
	return {
		...DEMO_PROFILES.sophomore,
		uploadedAt: new Date("2026-08-04T12:00:00-07:00").toISOString(),
		uploadedFileName: "caroline-hughes-sophomore-unofficial-transcript.pdf",
	};
}

function clonePlannerState(state: PlannerState): PlannerState {
	return {
		placedBlocks: Object.fromEntries(
			Object.entries(state.placedBlocks)
				.filter(([, block]) => block)
				.map(([termId, block]) => [termId, { ...block! }]),
		),
		pinnedCourses: { ...state.pinnedCourses },
	};
}

function serializePlannerState(state: PlannerState) {
	return JSON.stringify({
		pinnedCourses: Object.entries(state.pinnedCourses).sort(([left], [right]) =>
			left.localeCompare(right),
		),
		placedBlocks: Object.entries(state.placedBlocks)
			.filter(([, block]) => block)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([termId, block]) => [termId, block!.groupId, block!.type]),
	});
}

function createBlockGroupId(type: SpecialBlockType, termId: string) {
	return `${type}-${termId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getAcademicYearKey(term: DerivedTerm["term"]) {
	return term.kind === "fall" ? term.year : term.year - 1;
}

function buildYearRows(terms: DerivedTerm[], startYear: number): YearRow[] {
	const rows = new Map<number, YearRow>();

	for (const derivedTerm of terms) {
		const key = getAcademicYearKey(derivedTerm.term);

		if (!rows.has(key)) {
			rows.set(key, {
				key,
				label: `Year ${key - startYear + 1}`,
				terms: {},
			});
		}

		rows.get(key)!.terms[derivedTerm.term.kind] = derivedTerm;
	}

	return [...rows.values()].sort((left, right) => left.key - right.key);
}

function readDragPayload(event: DragEvent<HTMLElement>) {
	const raw = event.dataTransfer.getData("application/pathwise");
	if (!raw) return null;

	try {
		return JSON.parse(raw) as DragPayload;
	} catch {
		return null;
	}
}

function getTermIdAtOffset(termId: string, offset: number) {
	const currentIndex = getTermIndex(termId);
	if (currentIndex === -1) return null;

	return ACADEMIC_TERMS[currentIndex + offset]?.id ?? null;
}

function getTermIdsBetween(leftTermId: string, rightTermId: string) {
	const leftIndex = getTermIndex(leftTermId);
	const rightIndex = getTermIndex(rightTermId);

	if (leftIndex === -1 || rightIndex === -1) return [];

	const start = Math.min(leftIndex, rightIndex);
	const end = Math.max(leftIndex, rightIndex);

	return ACADEMIC_TERMS.slice(start, end + 1).map((term) => term.id);
}

function getTermIdsFromStartIndex(startIndex: number, length: number) {
	if (startIndex < 0 || length <= 0) return [];

	return ACADEMIC_TERMS.slice(startIndex, startIndex + length).map(
		(term) => term.id,
	);
}

function getDefaultWorkTermSpan(termId: string) {
	const term = ACADEMIC_TERMS[getTermIndex(termId)];
	if (!term) return [];

	if (term.kind === "spring") {
		return [termId, getTermIdAtOffset(termId, 1)].filter(Boolean) as string[];
	}

	if (term.kind === "summer1") {
		return [getTermIdAtOffset(termId, -1), termId].filter(Boolean) as string[];
	}

	if (term.kind === "summer2") {
		return [termId, getTermIdAtOffset(termId, 1)].filter(Boolean) as string[];
	}

	return [getTermIdAtOffset(termId, -1), termId].filter(Boolean) as string[];
}

function getDefaultBlockSpan(termId: string, blockType: SpecialBlockType) {
	if (blockType === "work-term") {
		return getDefaultWorkTermSpan(termId);
	}

	return [termId];
}

function clearPinnedFromTerms(
	pinnedCourses: PlannerState["pinnedCourses"],
	termIds: string[],
) {
	const blockedTerms = new Set(termIds);

	return Object.fromEntries(
		Object.entries(pinnedCourses).filter(
			([, pinnedTermId]) => !pinnedTermId || !blockedTerms.has(pinnedTermId),
		),
	);
}

function clearTouchedBlocks(
	placedBlocks: PlannerState["placedBlocks"],
	termIds: string[],
	preservedGroupId?: string,
) {
	const groupsToClear = new Set<string>();

	for (const termId of termIds) {
		const existingBlock = placedBlocks[termId];
		if (existingBlock && existingBlock.groupId !== preservedGroupId) {
			groupsToClear.add(existingBlock.groupId);
		}
	}

	const nextBlocks = { ...placedBlocks };

	for (const [termId, block] of Object.entries(nextBlocks)) {
		if (block && groupsToClear.has(block.groupId)) {
			delete nextBlocks[termId];
		}
	}

	return nextBlocks;
}

function buildBlockGroups(placedBlocks: PlannerState["placedBlocks"]) {
	const byGroupId = new Map<string, BlockGroup>();
	const byTermId = new Map<string, BlockGroup>();

	for (const [termId, block] of Object.entries(placedBlocks)) {
		if (!block) continue;

		const existingGroup = byGroupId.get(block.groupId);

		if (existingGroup) {
			existingGroup.termIds.push(termId);
			continue;
		}

		byGroupId.set(block.groupId, {
			endTermId: termId,
			groupId: block.groupId,
			startTermId: termId,
			termIds: [termId],
			type: block.type,
		});
	}

	for (const group of byGroupId.values()) {
		group.termIds.sort((left, right) => getTermIndex(left) - getTermIndex(right));
		group.startTermId = group.termIds[0];
		group.endTermId = group.termIds[group.termIds.length - 1];

		for (const termId of group.termIds) {
			byTermId.set(termId, group);
		}
	}

	return {
		byGroupId,
		byTermId,
	};
}

function buildBlockLabels(blockGroups: Map<string, BlockGroup>) {
	const labels = new Map<string, string>();
	const orderedGroups = [...blockGroups.values()].sort(
		(left, right) =>
			getTermIndex(left.startTermId) - getTermIndex(right.startTermId),
	);
	let coOpCount = 0;
	let internshipCount = 0;

	for (const group of orderedGroups) {
		if (group.type === "work-term") {
			coOpCount += 1;
			labels.set(group.groupId, `Co-op ${coOpCount}`);
			continue;
		}

		if (group.type === "internship") {
			internshipCount += 1;
			labels.set(group.groupId, `Internship ${internshipCount}`);
			continue;
		}

		labels.set(group.groupId, BLOCK_LABELS[group.type]);
	}

	return labels;
}

export function PathwiseApp() {
	const [activeView, setActiveView] = useState<ActiveView>("path-plan");
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
	const [draggingTermId, setDraggingTermId] = useState<string | null>(null);
	const [blockContextMenu, setBlockContextMenu] =
		useState<BlockContextMenu>(null);
	const [profile] = useState<StudentProfile>(() => createDemoProfile());
	const [plannerState, setPlannerState] = useState<PlannerState>(() =>
		clonePlannerState(DEFAULT_PLANNER_STATE),
	);
	const [savedPlannerState, setSavedPlannerState] = useState<PlannerState>(() =>
		clonePlannerState(DEFAULT_PLANNER_STATE),
	);

	useEffect(() => {
		const raw = window.localStorage.getItem(PLAN_STORAGE_KEY);
		if (!raw) return;

		try {
			const parsed = clonePlannerState(JSON.parse(raw) as PlannerState);
			setPlannerState(parsed);
			setSavedPlannerState(clonePlannerState(parsed));
		} catch {
			window.localStorage.removeItem(PLAN_STORAGE_KEY);
		}
	}, []);

	useEffect(() => {
		const handlePointerDown = (event: PointerEvent) => {
			const target = event.target as HTMLElement | null;
			if (target?.closest(".block-context-menu")) return;
			setBlockContextMenu(null);
		};

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setBlockContextMenu(null);
			}
		};

		window.addEventListener("pointerdown", handlePointerDown);
		window.addEventListener("keydown", handleKeyDown);

		return () => {
			window.removeEventListener("pointerdown", handlePointerDown);
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, []);

	useEffect(() => {
		setBlockContextMenu(null);
	}, [plannerState]);

	const snapshot = derivePlannerSnapshot(profile, plannerState);
	const yearRows = buildYearRows(snapshot.terms, profile.startYear);
	const lockedThroughIndex = getTermIndex(profile.lockedThroughTermId);
	const blockGroups = buildBlockGroups(plannerState.placedBlocks);
	const blockLabels = buildBlockLabels(blockGroups.byGroupId);
	const isDirty =
		serializePlannerState(plannerState) !==
		serializePlannerState(savedPlannerState);

	function isFutureTerm(termId: string) {
		return getTermIndex(termId) > lockedThroughIndex;
	}

	function moveCourse(courseId: string, termId: string) {
		if (!isFutureTerm(termId)) return;

		setPlannerState((current) => {
			const nextState: PlannerState = {
				placedBlocks: current.placedBlocks,
				pinnedCourses: {
					...current.pinnedCourses,
					[courseId]: termId,
				},
			};

			const nextSnapshot = derivePlannerSnapshot(profile, nextState);
			const targetTerm = nextSnapshot.terms.find(
				(entry) => entry.term.id === termId,
			);

			if (
				!targetTerm ||
				targetTerm.courses.length > targetTerm.hardCapacity
			) {
				return current;
			}

			return nextState;
		});
	}

	function placeSpecialBlock(termId: string, blockType: SpecialBlockType) {
		if (!isFutureTerm(termId)) return;

		setPlannerState((current) => {
			const spanTermIds = getDefaultBlockSpan(termId, blockType);

			if (
				spanTermIds.length === 0 ||
				spanTermIds.some((spanTermId) => !isFutureTerm(spanTermId))
			) {
				return current;
			}

			const nextBlocks = clearTouchedBlocks(current.placedBlocks, spanTermIds);
			const groupId = createBlockGroupId(blockType, termId);

			for (const spanTermId of spanTermIds) {
				nextBlocks[spanTermId] = {
					groupId,
					type: blockType,
				};
			}

			return {
				placedBlocks: nextBlocks,
				pinnedCourses: clearPinnedFromTerms(
					current.pinnedCourses,
					spanTermIds,
				),
			};
		});
	}

	function removeBlockGroup(groupId: string) {
		setPlannerState((current) => ({
			...current,
			placedBlocks: Object.fromEntries(
				Object.entries(current.placedBlocks).filter(
					([, block]) => !block || block.groupId !== groupId,
				),
			),
		}));
	}

	function resizePlacedBlock(
		groupId: string,
		edge: ResizeEdge,
		targetTermId: string,
	) {
		setPlannerState((current) => {
			const currentGroups = buildBlockGroups(current.placedBlocks);
			const blockGroup = currentGroups.byGroupId.get(groupId);

			if (
				!blockGroup ||
				(blockGroup.type !== "work-term" && blockGroup.type !== "internship")
			) {
				return current;
			}

			const startIndex = getTermIndex(blockGroup.startTermId);
			const endIndex = getTermIndex(blockGroup.endTermId);
			const targetIndex = getTermIndex(targetTermId);

			if (
				targetIndex === -1 ||
				(edge === "start" && targetIndex > endIndex) ||
				(edge === "end" && targetIndex < startIndex)
			) {
				return current;
			}

			const resizedTermIds =
				edge === "start"
					? getTermIdsBetween(targetTermId, blockGroup.endTermId)
					: getTermIdsBetween(blockGroup.startTermId, targetTermId);

			if (
				resizedTermIds.length === 0 ||
				resizedTermIds.some((nextTermId) => !isFutureTerm(nextTermId))
			) {
				return current;
			}

			const withoutCurrentGroup = Object.fromEntries(
				Object.entries(current.placedBlocks).filter(
					([, block]) => !block || block.groupId !== groupId,
				),
			);
			const nextBlocks = clearTouchedBlocks(withoutCurrentGroup, resizedTermIds);

			for (const nextTermId of resizedTermIds) {
				nextBlocks[nextTermId] = {
					groupId,
					type: blockGroup.type,
				};
			}

			return {
				placedBlocks: nextBlocks,
				pinnedCourses: clearPinnedFromTerms(
					current.pinnedCourses,
					resizedTermIds,
				),
			};
		});
	}

	function movePlacedBlock(
		groupId: string,
		anchorOffset: number,
		targetTermId: string,
	) {
		setPlannerState((current) => {
			const currentGroups = buildBlockGroups(current.placedBlocks);
			const blockGroup = currentGroups.byGroupId.get(groupId);

			if (!blockGroup) {
				return current;
			}

			const targetIndex = getTermIndex(targetTermId);
			const nextStartIndex = targetIndex - anchorOffset;
			const nextTermIds = getTermIdsFromStartIndex(
				nextStartIndex,
				blockGroup.termIds.length,
			);

			if (
				nextTermIds.length !== blockGroup.termIds.length ||
				nextTermIds.some((nextTermId) => !isFutureTerm(nextTermId))
			) {
				return current;
			}

			const withoutCurrentGroup = Object.fromEntries(
				Object.entries(current.placedBlocks).filter(
					([, block]) => !block || block.groupId !== groupId,
				),
			);
			const nextBlocks = clearTouchedBlocks(withoutCurrentGroup, nextTermIds);

			for (const nextTermId of nextTermIds) {
				nextBlocks[nextTermId] = {
					groupId,
					type: blockGroup.type,
				};
			}

			return {
				placedBlocks: nextBlocks,
				pinnedCourses: clearPinnedFromTerms(
					current.pinnedCourses,
					nextTermIds,
				),
			};
		});
	}

	function resetPlan() {
		setPlannerState(clonePlannerState(savedPlannerState));
	}

	function savePlan() {
		const nextSavedState = clonePlannerState(plannerState);
		window.localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(nextSavedState));
		setSavedPlannerState(nextSavedState);
	}

	function handleTermDrop(termId: string, event: DragEvent<HTMLElement>) {
		event.preventDefault();
		setDraggingTermId(null);

		if (!isFutureTerm(termId)) return;

		const payload = readDragPayload(event);
		if (!payload) return;

		if (payload.type === "course") {
			moveCourse(payload.courseId, termId);
			return;
		}

		if (payload.type === "move-block") {
			movePlacedBlock(payload.groupId, payload.anchorOffset, termId);
			return;
		}

		if (payload.type === "resize-block") {
			resizePlacedBlock(payload.groupId, payload.edge, termId);
			return;
		}

		placeSpecialBlock(termId, payload.blockType);
	}

	function openBlockContextMenu(
		event: ReactMouseEvent<HTMLElement>,
		groupId: string,
	) {
		event.preventDefault();
		event.stopPropagation();

		setBlockContextMenu({
			groupId,
			x: Math.min(event.clientX, window.innerWidth - 160),
			y: Math.min(event.clientY, window.innerHeight - 64),
		});
	}

	function renderCourse(course: ScheduledCourse, termId: string) {
		const interactive = course.status === "planned" && isFutureTerm(termId);

		return (
			<button
				key={course.id}
				type="button"
				title={`${course.code} · ${course.title}`}
				aria-label={`${course.code} ${course.title}`}
				draggable={interactive}
				onDragStart={(event) => {
					if (!interactive) return;

					event.dataTransfer.effectAllowed = "move";
					event.dataTransfer.setData(
						"application/pathwise",
						JSON.stringify({ type: "course", courseId: course.id }),
					);
				}}
				onDragEnd={() => setDraggingTermId(null)}
				className={`course-box ${COURSE_TONES[course.bucket]} ${
					interactive ? "" : "is-locked"
				}`}
			>
				{course.code}
				<span className="course-tooltip">{course.title}</span>
			</button>
		);
	}

	function renderPaletteBlock(type: SpecialBlockType) {
		return (
			<button
				type="button"
				key={type}
				draggable
				onDragStart={(event) => {
					event.dataTransfer.effectAllowed = "move";
					event.dataTransfer.setData(
						"application/pathwise",
						JSON.stringify({ type: "block", blockType: type }),
					);
				}}
				onDragEnd={() => setDraggingTermId(null)}
				className={`block-chip ${BLOCK_TONES[type]}`}
			>
				{BLOCK_LABELS[type]}
			</button>
		);
	}

	function renderPlacedBlock(termId: string) {
		const blockGroup = blockGroups.byTermId.get(termId);
		if (!blockGroup) return null;

		const isInteractive = isFutureTerm(termId);
		const isStart = blockGroup.startTermId === termId;
		const isEnd = blockGroup.endTermId === termId;
		const showHandles =
			isInteractive &&
			(blockGroup.type === "work-term" || blockGroup.type === "internship");
		const placedBlockLabel =
			blockLabels.get(blockGroup.groupId) ?? BLOCK_LABELS[blockGroup.type];

		return (
			<div
				draggable={isInteractive}
				className={`placed-block ${PLACED_BLOCK_TONES[blockGroup.type]} ${
					isStart ? "" : "is-continued-left"
				} ${isEnd ? "" : "is-continued-right"}`}
				onDragStart={(event) => {
					if (!isInteractive) return;

					event.dataTransfer.effectAllowed = "move";
					event.dataTransfer.setData(
						"application/pathwise",
						JSON.stringify({
							anchorOffset:
								getTermIndex(termId) - getTermIndex(blockGroup.startTermId),
							groupId: blockGroup.groupId,
							type: "move-block",
						}),
					);
				}}
				onDragEnd={() => setDraggingTermId(null)}
				onContextMenu={(event) => openBlockContextMenu(event, blockGroup.groupId)}
			>
				{showHandles && isStart ? (
					<button
						type="button"
						draggable
						aria-label={`Adjust ${BLOCK_LABELS[blockGroup.type]} earlier`}
						className="placed-block-handle placed-block-handle--start"
						onDragStart={(event) => {
							event.stopPropagation();
							event.dataTransfer.effectAllowed = "move";
							event.dataTransfer.setData(
								"application/pathwise",
								JSON.stringify({
									edge: "start",
									groupId: blockGroup.groupId,
									type: "resize-block",
								}),
							);
						}}
						onDragEnd={() => setDraggingTermId(null)}
					/>
				) : null}

				<span className="placed-block-label">
					{isStart ? placedBlockLabel : ""}
				</span>

				{showHandles && isEnd ? (
					<button
						type="button"
						draggable
						aria-label={`Adjust ${BLOCK_LABELS[blockGroup.type]} later`}
						className="placed-block-handle placed-block-handle--end"
						onDragStart={(event) => {
							event.stopPropagation();
							event.dataTransfer.effectAllowed = "move";
							event.dataTransfer.setData(
								"application/pathwise",
								JSON.stringify({
									edge: "end",
									groupId: blockGroup.groupId,
									type: "resize-block",
								}),
							);
						}}
						onDragEnd={() => setDraggingTermId(null)}
					/>
				) : null}
			</div>
		);
	}

	function renderPathPlan() {
		return (
			<section className="pathwise-screen">
				<header className="screen-header screen-header--with-actions">
					<h1 className="screen-title">Path Plan</h1>

					<div className="plan-actions">
						<button
							type="button"
							disabled={!isDirty}
							className="plan-action-button"
							onClick={resetPlan}
						>
							Reset
						</button>
						<button
							type="button"
							disabled={!isDirty}
							className="plan-action-button plan-action-button--primary"
							onClick={savePlan}
						>
							Save Plan
						</button>
					</div>
				</header>

				<div className="path-plan-board">
					<div className="path-plan-calendar-wrap">
						<div className="path-plan-grid">
							<div />
							{TERM_ORDER.map((kind) => (
								<div key={kind} className="path-plan-term-heading">
									{TERM_LABELS[kind]}
								</div>
							))}

							{yearRows.map((row) => (
								<Fragment key={row.key}>
									<div className="path-plan-year-label">{row.label}</div>

									{TERM_ORDER.map((kind) => {
										const derivedTerm = row.terms[kind];
										const termId = derivedTerm?.term.id;
										const canDrop = termId ? isFutureTerm(termId) : false;
										const isDropTarget =
											termId !== undefined && draggingTermId === termId;

										return (
											<div
												key={`${row.key}-${kind}`}
												className={`path-plan-term ${
													canDrop ? "is-future" : "is-past"
												} ${isDropTarget ? "is-drop-target" : ""}`}
												onDragOver={(event) => {
													if (!canDrop || !termId) return;
													event.preventDefault();
													setDraggingTermId(termId);
												}}
												onDragLeave={() => {
													if (isDropTarget) {
														setDraggingTermId(null);
													}
												}}
												onDrop={(event) => {
													if (!termId) return;
													handleTermDrop(termId, event);
												}}
											>
												{termId ? renderPlacedBlock(termId) : null}
												{derivedTerm?.courses.map((course) =>
													renderCourse(course, derivedTerm.term.id),
												)}
											</div>
										);
									})}
								</Fragment>
							))}
						</div>
					</div>

					<aside className="path-plan-blocks">
						<p className="block-label">Blocks</p>
						<div className="block-list">
							{renderPaletteBlock("work-term")}
							{renderPaletteBlock("internship")}
							{renderPaletteBlock("time-off")}
						</div>
					</aside>
				</div>

				<footer className="path-plan-summary">
					<p className="summary-item">
						<span className="summary-label">Credits</span>
						<span className="summary-value">
							{snapshot.satisfiedCredits}/{TOTAL_DEGREE_CREDITS} completed
						</span>
					</p>
					<p className="summary-item">
						<span className="summary-label">In Progress</span>
						<span className="summary-value">
							{snapshot.inProgressCredits} credits
						</span>
					</p>
					<p className="summary-item">
						<span className="summary-label">Projected Graduation</span>
						<span className="summary-value">{snapshot.projectedGraduation}</span>
					</p>
				</footer>

				{blockContextMenu ? (
					<div
						className="block-context-menu"
						style={{
							left: blockContextMenu.x,
							top: blockContextMenu.y,
						}}
					>
						<button
							type="button"
							className="block-context-menu-button"
							onClick={() => removeBlockGroup(blockContextMenu.groupId)}
						>
							Delete block
						</button>
					</div>
				) : null}
			</section>
		);
	}

	function renderProfile() {
		return (
			<section className="pathwise-screen">
				<header className="screen-header">
					<h1 className="screen-title">Profile</h1>
				</header>

				<div className="profile-copy">
					<p>
						<span className="profile-label">Name</span>
						<span className="profile-value">Caroline Hughes</span>
					</p>
					<p>
						<span className="profile-label">School</span>
						<span className="profile-value">{profile.school}</span>
					</p>
					<p>
						<span className="profile-label">Program</span>
						<span className="profile-value">{profile.program}</span>
					</p>
					<p>
						<span className="profile-label">Start</span>
						<span className="profile-value">Fall {profile.startYear}</span>
					</p>
					<p>
						<span className="profile-label">Target Graduation</span>
						<span className="profile-value">{profile.targetGraduation}</span>
					</p>
					<p>
						<span className="profile-label">Open To</span>
						<span className="profile-value">{profile.openToGraduation}</span>
					</p>
				</div>
			</section>
		);
	}

	return (
		<main
			className="pathwise-shell"
			data-nav-collapsed={sidebarCollapsed ? "true" : "false"}
		>
			<aside className="pathwise-sidebar">
				<button
					type="button"
					className="pathwise-sidebar-toggle"
					aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
					onClick={() => setSidebarCollapsed((current) => !current)}
				>
					{sidebarCollapsed ? "→" : "←"}
				</button>

				<nav className="pathwise-nav" aria-label="Primary">
					<button
						type="button"
						aria-current={activeView === "profile" ? "page" : undefined}
						className={`pathwise-nav-button ${
							activeView === "profile" ? "is-active" : ""
						}`}
						onClick={() => setActiveView("profile")}
					>
						{sidebarCollapsed ? "Pr" : "Profile"}
					</button>
					<button
						type="button"
						aria-current={activeView === "path-plan" ? "page" : undefined}
						className={`pathwise-nav-button ${
							activeView === "path-plan" ? "is-active" : ""
						}`}
						onClick={() => setActiveView("path-plan")}
					>
						{sidebarCollapsed ? "Plan" : "Path Plan"}
					</button>
				</nav>
			</aside>

			<div className="pathwise-content">
				{activeView === "path-plan" ? renderPathPlan() : renderProfile()}
			</div>
		</main>
	);
}
