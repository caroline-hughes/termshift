"use client";

import {
	Fragment,
	useEffect,
	useRef,
	useState,
	type ChangeEvent,
	type DragEvent,
	type MouseEvent as ReactMouseEvent,
} from "react";
import {
	ACADEMIC_TERMS,
	DEMO_PROFILES,
	DEFAULT_PLANNER_STATE,
	REQUIREMENTS_URL,
	TOTAL_DEGREE_CREDITS,
	buildProfileFromUpload,
	getTermIndex,
} from "@/lib/pathwise-data";
import { derivePlannerSnapshot } from "@/lib/pathwise-planner";
import {
	buildOpportunitySuggestions,
	type OpportunitySuggestion,
} from "@/lib/termshift-opportunities";
import type {
	CourseBucket,
	DerivedTerm,
	PlannerState,
	ScheduledCourse,
	SpecialBlockType,
	StudentProfile,
	TermKind,
} from "@/lib/pathwise-types";

type ActiveView = "profile" | "plan" | "search";
type ResizeEdge = "start" | "end";
type SchoolOption = "Northeastern University" | "Columbia University";

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
	label?: string;
	startTermId: string;
	termIds: string[];
	type: SpecialBlockType;
};

type BlockContextMenu = {
	groupId: string;
	x: number;
	y: number;
} | null;

type IdentityState = {
	fullName: string;
	school: SchoolOption;
};

type UploadState = {
	message: string;
	selectedFileName: string;
	status: "error" | "idle" | "processing" | "ready";
};

type PersistedSession = {
	activeScenarioId: string | null;
	experimentMode: boolean;
	identity: IdentityState;
	plannerState: PlannerState;
	profile: StudentProfile | null;
	savedPlannerState: PlannerState;
	savedScenarios: SavedScenario[];
	selectedOpportunityId: string | null;
};

type OpportunityPreview = OpportunitySuggestion & {
	projectedGraduation: string;
	signalCount: number;
	topSignals: string[];
};

type SavedScenario = {
	id: string;
	opportunityId: string | null;
	plannerState: PlannerState;
	projectedGraduation: string;
	signalCount: number;
	title: string;
	topSignals: string[];
	updatedAt: string;
};

type PdfTextItem = {
	str?: string;
};

type SaveScenarioModalState = {
	defaultTitle: string;
	isOpen: boolean;
	value: string;
};

const APP_STORAGE_KEY = "termshift-session-v1";

const TERM_ORDER: TermKind[] = ["fall", "spring", "summer1", "summer2"];
const SCHOOL_OPTIONS: SchoolOption[] = [
	"Northeastern University",
	"Columbia University",
];

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

function createDefaultIdentity(): IdentityState {
	return {
		fullName: "Caroline Hughes",
		school: "Northeastern University",
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
		pinnedCourses: Object.entries(state.pinnedCourses).sort(
			([left], [right]) => left.localeCompare(right),
		),
		placedBlocks: Object.entries(state.placedBlocks)
			.filter(([, block]) => block)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([termId, block]) => [
				termId,
				block!.groupId,
				block!.type,
				block!.label ?? null,
			]),
	});
}

function createBlockGroupId(type: SpecialBlockType, termId: string) {
	return `${type}-${termId}-${Date.now()}-${Math.random()
		.toString(36)
		.slice(2, 8)}`;
}

function createScenarioId() {
	return `scenario-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildScenarioTitleSuggestion(
	selectedOpportunity: OpportunitySuggestion | null,
	activeSavedScenario: SavedScenario | null,
	savedScenarios: SavedScenario[],
) {
	if (activeSavedScenario) {
		return activeSavedScenario.title;
	}

	if (selectedOpportunity) {
		return `${selectedOpportunity.company} · ${selectedOpportunity.termLabel}`;
	}

	return `Manual scenario ${
		savedScenarios.filter((scenario) => scenario.opportunityId === null)
			.length + 1
	}`;
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
		return [termId, getTermIdAtOffset(termId, 1)].filter(
			Boolean,
		) as string[];
	}

	if (term.kind === "summer1") {
		return [getTermIdAtOffset(termId, -1), termId].filter(
			Boolean,
		) as string[];
	}

	if (term.kind === "summer2") {
		return [termId, getTermIdAtOffset(termId, 1)].filter(
			Boolean,
		) as string[];
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
			([, pinnedTermId]) =>
				!pinnedTermId || !blockedTerms.has(pinnedTermId),
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
			label: block.label,
			startTermId: termId,
			termIds: [termId],
			type: block.type,
		});
	}

	for (const group of byGroupId.values()) {
		group.termIds.sort(
			(left, right) => getTermIndex(left) - getTermIndex(right),
		);
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
			labels.set(group.groupId, group.label ?? `Co-op ${coOpCount}`);
			continue;
		}

		if (group.type === "internship") {
			internshipCount += 1;
			labels.set(
				group.groupId,
				group.label ?? `Internship ${internshipCount}`,
			);
			continue;
		}

		labels.set(group.groupId, group.label ?? BLOCK_LABELS[group.type]);
	}

	return labels;
}

function buildDemoProfile(fileName: string) {
	return {
		...DEMO_PROFILES.sophomore,
		uploadedAt: new Date().toISOString(),
		uploadedFileName: fileName,
		parserNote:
			"Used the seeded Northeastern sophomore profile for the MVP demo state.",
	};
}

function applyIdentityToProfile(
	baseProfile: StudentProfile,
	identity: IdentityState,
): StudentProfile {
	const parserNote =
		identity.school === "Northeastern University"
			? baseProfile.parserNote
			: `${baseProfile.parserNote} Degree-path modeling in this MVP is still seeded to Northeastern CS requirements while TermShift's onboarding and co-op search stay school-aware.`;

	return {
		...baseProfile,
		label: `${identity.fullName} · academic snapshot`,
		school: identity.school,
		parserNote,
	};
}

async function extractUploadText(file: File) {
	const isPdf =
		file.type.includes("pdf") || file.name.toLowerCase().endsWith(".pdf");

	if (!isPdf) {
		return await file.text();
	}

	const pdfjs = await import("pdfjs-dist/webpack.mjs");
	const data = new Uint8Array(await file.arrayBuffer());
	const pdf = await pdfjs.getDocument({ data }).promise;
	const pages: string[] = [];

	for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
		const page = await pdf.getPage(pageNumber);
		const textContent = await page.getTextContent();
		const pageText = textContent.items
			.map((item: unknown) => (item as PdfTextItem).str ?? "")
			.join(" ");
		pages.push(pageText);
	}

	return pages.join("\n");
}

function buildScenarioState(
	baseState: PlannerState,
	termIds: string[],
	blockType: SpecialBlockType,
	blockLabel?: string,
) {
	const nextBlocks = clearTouchedBlocks(baseState.placedBlocks, termIds);
	const groupId = createBlockGroupId(blockType, termIds[0] ?? "scenario");

	for (const termId of termIds) {
		nextBlocks[termId] = {
			groupId,
			label: blockLabel,
			type: blockType,
		};
	}

	return {
		placedBlocks: nextBlocks,
		pinnedCourses: clearPinnedFromTerms(baseState.pinnedCourses, termIds),
	};
}

export function TermShiftApp() {
	const [activeView, setActiveView] = useState<ActiveView>("profile");
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
	const [draggingTermId, setDraggingTermId] = useState<string | null>(null);
	const [blockContextMenu, setBlockContextMenu] =
		useState<BlockContextMenu>(null);
	const [identity, setIdentity] = useState<IdentityState>(
		createDefaultIdentity,
	);
	const [profile, setProfile] = useState<StudentProfile | null>(null);
	const [plannerState, setPlannerState] = useState<PlannerState>(() =>
		clonePlannerState(DEFAULT_PLANNER_STATE),
	);
	const [savedPlannerState, setSavedPlannerState] = useState<PlannerState>(
		() => clonePlannerState(DEFAULT_PLANNER_STATE),
	);
	const [selectedOpportunityId, setSelectedOpportunityId] = useState<
		string | null
	>(null);
	const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([]);
	const [activeScenarioId, setActiveScenarioId] = useState<string | null>(
		null,
	);
	const [browseOpportunityId, setBrowseOpportunityId] = useState<
		string | null
	>(null);
	const [experimentMode, setExperimentMode] = useState(false);
	const [uploadState, setUploadState] = useState<UploadState>({
		message: "",
		selectedFileName: "",
		status: "idle",
	});
	const [saveScenarioModal, setSaveScenarioModal] =
		useState<SaveScenarioModalState>({
			defaultTitle: "",
			isOpen: false,
			value: "",
		});
	const [uploadedDocumentUrl, setUploadedDocumentUrl] = useState<
		string | null
	>(null);
	const [highlightedProfileSection, setHighlightedProfileSection] = useState<
		"upload" | null
	>(null);
	const [pendingUpload, setPendingUpload] = useState<File | null>(null);
	const [didHydrate, setDidHydrate] = useState(false);
	const uploadedDocumentUrlRef = useRef<string | null>(null);
	const profileHighlightTimeoutRef = useRef<number | null>(null);

	useEffect(() => {
		let cancelled = false;

		window.setTimeout(() => {
			if (cancelled) return;

			const raw = window.localStorage.getItem(APP_STORAGE_KEY);
			if (!raw) {
				setDidHydrate(true);
				return;
			}

			try {
				const parsed = JSON.parse(raw) as PersistedSession;

				if (parsed.identity) {
					setIdentity(parsed.identity);
				}

				if (parsed.profile) {
					setProfile(parsed.profile);
					setUploadState({
						message: parsed.profile.parserNote,
						selectedFileName: parsed.profile.uploadedFileName,
						status: "ready",
					});
					setActiveView("plan");
				}

				if (parsed.plannerState) {
					setPlannerState(clonePlannerState(parsed.plannerState));
				}

				if (parsed.savedPlannerState) {
					setSavedPlannerState(
						clonePlannerState(parsed.savedPlannerState),
					);
				}

				setSavedScenarios(
					(parsed.savedScenarios ?? []).map((scenario) => ({
						...scenario,
						plannerState: clonePlannerState(scenario.plannerState),
					})),
				);
				setActiveScenarioId(parsed.activeScenarioId ?? null);
				setSelectedOpportunityId(parsed.selectedOpportunityId ?? null);
				setExperimentMode(parsed.experimentMode ?? false);
			} catch {
				window.localStorage.removeItem(APP_STORAGE_KEY);
			} finally {
				setDidHydrate(true);
			}
		}, 0);

		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (!didHydrate) return;

		const session: PersistedSession = {
			activeScenarioId,
			experimentMode,
			identity,
			plannerState,
			profile,
			savedPlannerState,
			savedScenarios,
			selectedOpportunityId,
		};

		window.localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(session));
	}, [
		didHydrate,
		activeScenarioId,
		experimentMode,
		identity,
		plannerState,
		profile,
		savedPlannerState,
		savedScenarios,
		selectedOpportunityId,
	]);

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
		return () => {
			if (profileHighlightTimeoutRef.current) {
				window.clearTimeout(profileHighlightTimeoutRef.current);
			}

			if (
				uploadedDocumentUrlRef.current &&
				uploadedDocumentUrlRef.current.startsWith("blob:")
			) {
				URL.revokeObjectURL(uploadedDocumentUrlRef.current);
			}
		};
	}, []);

	const experimentSnapshot = profile
		? derivePlannerSnapshot(profile, plannerState)
		: null;
	const savedSnapshot = profile
		? derivePlannerSnapshot(profile, savedPlannerState)
		: null;
	const snapshot = experimentMode ? experimentSnapshot : savedSnapshot;
	const displayedPlannerState = experimentMode
		? plannerState
		: savedPlannerState;
	const yearRows =
		profile && snapshot
			? buildYearRows(snapshot.terms, profile.startYear)
			: [];
	const lockedThroughIndex = profile
		? getTermIndex(profile.lockedThroughTermId)
		: -1;
	const blockGroups = buildBlockGroups(displayedPlannerState.placedBlocks);
	const blockLabels = buildBlockLabels(blockGroups.byGroupId);
	const opportunityPreviews: OpportunityPreview[] =
		profile && savedSnapshot
			? buildOpportunitySuggestions(profile).map((opportunity) => {
					const scenarioTerms = getTermIdsBetween(
						opportunity.termStartId,
						opportunity.termEndId,
					);
					const scenarioState = buildScenarioState(
						clonePlannerState(savedPlannerState),
						scenarioTerms,
						"work-term",
						`Co-op: ${opportunity.company}`,
					);
					const scenarioSnapshot = derivePlannerSnapshot(
						profile,
						scenarioState,
					);

					return {
						...opportunity,
						projectedGraduation:
							scenarioSnapshot.projectedGraduation,
						signalCount: scenarioSnapshot.warnings.length,
						topSignals: scenarioSnapshot.warnings.slice(0, 3),
					};
			  })
			: [];

	const selectedOpportunity =
		opportunityPreviews.find(
			(opportunity) => opportunity.id === selectedOpportunityId,
		) ?? null;
	const activeSavedScenario =
		savedScenarios.find((scenario) => scenario.id === activeScenarioId) ??
		null;
	const activeSearchOpportunity =
		opportunityPreviews.find(
			(opportunity) => opportunity.id === browseOpportunityId,
		) ??
		opportunityPreviews[0] ??
		null;

	const baselineFingerprint = serializePlannerState(savedPlannerState);
	const activeScenarioFingerprint = activeSavedScenario
		? serializePlannerState(activeSavedScenario.plannerState)
		: null;
	const currentFingerprint = serializePlannerState(plannerState);
	const hasExperimentChanges = currentFingerprint !== baselineFingerprint;
	const isDirty = activeScenarioFingerprint
		? currentFingerprint !== activeScenarioFingerprint
		: hasExperimentChanges;
	const requirementsLinkLabel = "Degree requirements";

	function isFutureTerm(termId: string) {
		return profile ? getTermIndex(termId) > lockedThroughIndex : false;
	}

	function replaceUploadedDocumentUrl(nextUrl: string | null) {
		if (
			uploadedDocumentUrlRef.current &&
			uploadedDocumentUrlRef.current.startsWith("blob:")
		) {
			URL.revokeObjectURL(uploadedDocumentUrlRef.current);
		}

		uploadedDocumentUrlRef.current = nextUrl;
		setUploadedDocumentUrl(nextUrl);
	}

	function highlightProfileUploadSection() {
		setActiveView("profile");
		setHighlightedProfileSection("upload");

		if (profileHighlightTimeoutRef.current) {
			window.clearTimeout(profileHighlightTimeoutRef.current);
		}

		window.setTimeout(() => {
			document
				.getElementById("profile-upload-section")
				?.scrollIntoView({ behavior: "smooth", block: "center" });
		}, 80);

		profileHighlightTimeoutRef.current = window.setTimeout(() => {
			setHighlightedProfileSection(null);
		}, 2400);
	}

	function canInteractWithTerm(termId: string) {
		return experimentMode && isFutureTerm(termId);
	}

	function moveCourse(courseId: string, termId: string) {
		if (!profile || !canInteractWithTerm(termId)) return;

		setBlockContextMenu(null);
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
		if (!canInteractWithTerm(termId)) return;

		setBlockContextMenu(null);
		setPlannerState((current) => {
			const spanTermIds = getDefaultBlockSpan(termId, blockType);

			if (
				spanTermIds.length === 0 ||
				spanTermIds.some(
					(spanTermId) => !canInteractWithTerm(spanTermId),
				)
			) {
				return current;
			}

			const nextBlocks = clearTouchedBlocks(
				current.placedBlocks,
				spanTermIds,
			);
			const groupId = createBlockGroupId(blockType, termId);

			for (const spanTermId of spanTermIds) {
				nextBlocks[spanTermId] = {
					groupId,
					label: undefined,
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
		setBlockContextMenu(null);
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
		if (!profile) return;

		setBlockContextMenu(null);
		setPlannerState((current) => {
			const currentGroups = buildBlockGroups(current.placedBlocks);
			const blockGroup = currentGroups.byGroupId.get(groupId);

			if (
				!blockGroup ||
				(blockGroup.type !== "work-term" &&
					blockGroup.type !== "internship")
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
				resizedTermIds.some(
					(nextTermId) => !canInteractWithTerm(nextTermId),
				)
			) {
				return current;
			}

			const withoutCurrentGroup = Object.fromEntries(
				Object.entries(current.placedBlocks).filter(
					([, block]) => !block || block.groupId !== groupId,
				),
			);
			const nextBlocks = clearTouchedBlocks(
				withoutCurrentGroup,
				resizedTermIds,
			);

			for (const nextTermId of resizedTermIds) {
				nextBlocks[nextTermId] = {
					groupId,
					label: blockGroup.label,
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
		if (!profile) return;

		setBlockContextMenu(null);
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
				nextTermIds.some(
					(nextTermId) => !canInteractWithTerm(nextTermId),
				)
			) {
				return current;
			}

			const withoutCurrentGroup = Object.fromEntries(
				Object.entries(current.placedBlocks).filter(
					([, block]) => !block || block.groupId !== groupId,
				),
			);
			const nextBlocks = clearTouchedBlocks(
				withoutCurrentGroup,
				nextTermIds,
			);

			for (const nextTermId of nextTermIds) {
				nextBlocks[nextTermId] = {
					groupId,
					label: blockGroup.label,
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
		setBlockContextMenu(null);
		setSaveScenarioModal((current) => ({ ...current, isOpen: false }));
		setPlannerState(clonePlannerState(savedPlannerState));
		setSelectedOpportunityId(null);
		setActiveScenarioId(null);
	}

	function openSaveScenarioModal() {
		if (!isDirty) return;

		const defaultTitle = buildScenarioTitleSuggestion(
			selectedOpportunity,
			activeSavedScenario,
			savedScenarios,
		);

		setSaveScenarioModal({
			defaultTitle,
			isOpen: true,
			value: defaultTitle,
		});
	}

	function saveScenario() {
		if (!snapshot) return;

		const scenarioTitle =
			saveScenarioModal.value.trim() || saveScenarioModal.defaultTitle;

		const nextScenario: SavedScenario = {
			id: activeSavedScenario?.id ?? createScenarioId(),
			opportunityId: selectedOpportunityId,
			plannerState: clonePlannerState(plannerState),
			projectedGraduation: snapshot.projectedGraduation,
			signalCount: snapshot.warnings.length,
			title: scenarioTitle,
			topSignals: snapshot.warnings.slice(0, 2),
			updatedAt: new Date().toISOString(),
		};

		setSavedScenarios((current) => {
			const existingIndex = current.findIndex(
				(scenario) => scenario.id === nextScenario.id,
			);

			if (existingIndex === -1) {
				return [nextScenario, ...current];
			}

			const updated = [...current];
			updated[existingIndex] = nextScenario;
			return updated.sort(
				(left, right) =>
					new Date(right.updatedAt).getTime() -
					new Date(left.updatedAt).getTime(),
			);
		});
		setActiveScenarioId(nextScenario.id);
		setSaveScenarioModal((current) => ({ ...current, isOpen: false }));
	}

	function loadSavedScenario(scenarioId: string) {
		const scenario = savedScenarios.find(
			(entry) => entry.id === scenarioId,
		);
		if (!scenario) return;

		setBlockContextMenu(null);
		setSaveScenarioModal((current) => ({ ...current, isOpen: false }));
		setPlannerState(clonePlannerState(scenario.plannerState));
		setSelectedOpportunityId(scenario.opportunityId);
		setBrowseOpportunityId(scenario.opportunityId);
		setActiveScenarioId(scenario.id);
		setExperimentMode(true);
		setActiveView("plan");
	}

	function deleteSavedScenario(scenarioId: string) {
		const deletingActive = scenarioId === activeScenarioId;

		setSaveScenarioModal((current) => ({ ...current, isOpen: false }));
		setSavedScenarios((current) =>
			current.filter((scenario) => scenario.id !== scenarioId),
		);

		if (deletingActive) {
			setPlannerState(clonePlannerState(savedPlannerState));
			setSelectedOpportunityId(null);
			setActiveScenarioId(null);
		}
	}

	function handleTermDrop(termId: string, event: DragEvent<HTMLElement>) {
		event.preventDefault();
		setDraggingTermId(null);

		if (!canInteractWithTerm(termId)) return;

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

	function navigateToView(view: ActiveView) {
		if (!profile && view !== "profile") {
			setActiveView("profile");
			return;
		}

		setActiveView(view);
	}

	function applyOpportunityScenario(opportunity: OpportunitySuggestion) {
		if (!profile) return;

		setBlockContextMenu(null);
		setSaveScenarioModal((current) => ({ ...current, isOpen: false }));
		const termIds = getTermIdsBetween(
			opportunity.termStartId,
			opportunity.termEndId,
		);
		const nextState = buildScenarioState(
			clonePlannerState(savedPlannerState),
			termIds,
			"work-term",
			`Co-op: ${opportunity.company}`,
		);

		setPlannerState(nextState);
		setSelectedOpportunityId(opportunity.id);
		setBrowseOpportunityId(opportunity.id);
		setActiveScenarioId(null);
		setExperimentMode(true);
		setActiveView("plan");
	}

	async function completeProfile(useSeededDemo = false) {
		const fileName =
			pendingUpload?.name ??
			`${identity.fullName
				.toLowerCase()
				.replaceAll(" ", "-")}-demo-transcript.pdf`;

		setUploadState({
			message: useSeededDemo
				? "Loading the seeded demo profile."
				: "Processing upload.",
			selectedFileName: fileName,
			status: "processing",
		});

		try {
			const extractedText =
				useSeededDemo || !pendingUpload
					? ""
					: await extractUploadText(pendingUpload);
			const baseProfile =
				useSeededDemo || !pendingUpload
					? buildDemoProfile(fileName)
					: buildProfileFromUpload(fileName, extractedText);
			const nextProfile = applyIdentityToProfile(baseProfile, identity);
			const nextUploadedDocumentUrl =
				useSeededDemo || !pendingUpload
					? null
					: URL.createObjectURL(pendingUpload);

			setProfile(nextProfile);
			replaceUploadedDocumentUrl(nextUploadedDocumentUrl);
			setPlannerState(clonePlannerState(DEFAULT_PLANNER_STATE));
			setSavedPlannerState(clonePlannerState(DEFAULT_PLANNER_STATE));
			setSavedScenarios([]);
			setActiveScenarioId(null);
			setSelectedOpportunityId(null);
			setBrowseOpportunityId(null);
			setExperimentMode(false);
			setSaveScenarioModal({
				defaultTitle: "",
				isOpen: false,
				value: "",
			});
			setPendingUpload(null);
			setUploadState({
				message: nextProfile.parserNote,
				selectedFileName: fileName,
				status: "ready",
			});
			setActiveView("plan");
		} catch {
			setUploadState({
				message:
					"TermShift could not read that file cleanly. Try the seeded demo fallback for now.",
				selectedFileName: fileName,
				status: "error",
			});
		}
	}

	function handleFileSelection(event: ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0] ?? null;
		event.target.value = "";

		if (!file) return;

		setPendingUpload(file);
		setUploadState({
			message: "",
			selectedFileName: file.name,
			status: "idle",
		});
	}

	function renderCourse(course: ScheduledCourse, termId: string) {
		const interactive =
			experimentMode &&
			course.status === "planned" &&
			isFutureTerm(termId);

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
				draggable={experimentMode}
				disabled={!experimentMode}
				onDragStart={(event) => {
					if (!experimentMode) return;

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

		const isInteractive = canInteractWithTerm(termId);
		const isStart = blockGroup.startTermId === termId;
		const isEnd = blockGroup.endTermId === termId;
		const showHandles =
			isInteractive &&
			(blockGroup.type === "work-term" ||
				blockGroup.type === "internship");
		const placedBlockLabel =
			blockLabels.get(blockGroup.groupId) ??
			BLOCK_LABELS[blockGroup.type];

		return (
			<div
				draggable={isInteractive}
				className={`placed-block ${
					PLACED_BLOCK_TONES[blockGroup.type]
				} ${isStart ? "" : "is-continued-left"} ${
					isEnd ? "" : "is-continued-right"
				}`}
				onDragStart={(event) => {
					if (!isInteractive) return;

					event.dataTransfer.effectAllowed = "move";
					event.dataTransfer.setData(
						"application/pathwise",
						JSON.stringify({
							anchorOffset:
								getTermIndex(termId) -
								getTermIndex(blockGroup.startTermId),
							groupId: blockGroup.groupId,
							type: "move-block",
						}),
					);
				}}
				onDragEnd={() => setDraggingTermId(null)}
				onContextMenu={(event) =>
					openBlockContextMenu(event, blockGroup.groupId)
				}
			>
				{showHandles && isStart ? (
					<button
						type="button"
						draggable
						aria-label={`Adjust ${
							BLOCK_LABELS[blockGroup.type]
						} earlier`}
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
						aria-label={`Adjust ${
							BLOCK_LABELS[blockGroup.type]
						} later`}
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

	function renderProfileScreen() {
		if (!profile) {
			return (
				<section className="pathwise-screen">
					<header className="screen-header">
						<h1 className="screen-title">Complete Profile</h1>
						<p className="screen-intro">
							Pick your school, upload your unofficial transcript
							or degree audit, and let TermShift seed the baseline
							plan before you start testing work terms.
						</p>
					</header>

					<div className="profile-form-wrap">
						<label className="form-field">
							<span className="profile-label">Full Name</span>
							<input
								type="text"
								value={identity.fullName}
								className="profile-input"
								onChange={(event) =>
									setIdentity((current) => ({
										...current,
										fullName: event.target.value,
									}))
								}
							/>
						</label>

						<label className="form-field">
							<span className="profile-label">School</span>
							<select
								value={identity.school}
								className="profile-input"
								onChange={(event) =>
									setIdentity((current) => ({
										...current,
										school: event.target
											.value as SchoolOption,
									}))
								}
							>
								{SCHOOL_OPTIONS.map((school) => (
									<option key={school} value={school}>
										{school}
									</option>
								))}
							</select>
						</label>

						<div className="form-field">
							<span className="profile-label">
								Transcript Or Degree Audit
							</span>
							<div className="upload-row">
								<label className="plan-action-button upload-button">
									Upload transcript
									<input
										type="file"
										accept=".pdf,.txt"
										className="upload-input"
										onChange={handleFileSelection}
									/>
								</label>
								<span className="upload-file-name">
									{pendingUpload?.name ?? "No file selected"}
								</span>
							</div>
						</div>

						{identity.school === "Columbia University" ? (
							<p className="inline-note">
								Search is school-aware for both schools.
								Degree-path modeling in this MVP still uses the
								Northeastern CS ruleset behind the scenes.
							</p>
						) : null}

						{uploadState.message ? (
							<p
								className={`inline-note inline-note--${uploadState.status}`}
							>
								{uploadState.message}
							</p>
						) : null}

						<div className="form-actions">
							<button
								type="button"
								disabled={
									!pendingUpload ||
									uploadState.status === "processing"
								}
								className="plan-action-button plan-action-button--primary"
								onClick={() => completeProfile(false)}
							>
								{uploadState.status === "processing"
									? "Processing"
									: "Complete profile"}
							</button>
							<button
								type="button"
								className="plan-action-button"
								disabled={uploadState.status === "processing"}
								onClick={() => completeProfile(true)}
							>
								Use seeded demo
							</button>
						</div>
					</div>
				</section>
			);
		}

		return (
			<section className="pathwise-screen">
				<header className="screen-header">
					<h1 className="screen-title">Profile</h1>
					{/* <p className="screen-intro">
						This snapshot feeds both the planner and the co-op
						search ranking. You can replace the upload at any time
						and reseed the MVP state.
					</p> */}
				</header>

				<div className="profile-copy">
					<p>
						<span className="profile-label">Name</span>
						<span className="profile-value">
							{identity.fullName}
						</span>
					</p>
					<p>
						<span className="profile-label">School</span>
						<span className="profile-value">{identity.school}</span>
					</p>
					<p>
						<span className="profile-label">Program Model</span>
						<span className="profile-value">{profile.program}</span>
						<a
							href={REQUIREMENTS_URL}
							target="_blank"
							rel="noreferrer"
							className="profile-inline-link"
						>
							View Requirements
						</a>
					</p>
					<div
						id="profile-upload-section"
						className={`profile-section ${
							highlightedProfileSection === "upload"
								? "is-highlighted"
								: ""
						}`}
					>
						<span className="profile-label">Upload</span>
						<span className="profile-value">
							{uploadedDocumentUrl ? (
								<a
									href={uploadedDocumentUrl}
									target="_blank"
									rel="noreferrer"
									className="profile-upload-link"
								>
									{profile.uploadedFileName}
								</a>
							) : (
								profile.uploadedFileName
							)}
						</span>
						<div className="profile-actions-row profile-actions-row--stacked">
							<label className="plan-action-button upload-button">
								Replace upload
								<input
									type="file"
									accept=".pdf,.txt"
									className="upload-input"
									onChange={handleFileSelection}
								/>
							</label>
						</div>
					</div>
				</div>

				{pendingUpload ? (
					<div className="profile-actions-row">
						<span className="upload-file-name">
							{pendingUpload.name}
						</span>
						<button
							type="button"
							disabled={uploadState.status === "processing"}
							className="plan-action-button plan-action-button--primary"
							onClick={() => completeProfile(false)}
						>
							Update profile from upload
						</button>
					</div>
				) : null}

				<p className={`inline-note inline-note--${uploadState.status}`}>
					{uploadState.message || profile.parserNote}
				</p>
			</section>
		);
	}

	function renderPathPlan() {
		if (!profile || !snapshot || !savedSnapshot) return null;

		return (
			<section className="pathwise-screen">
				<header className="screen-header">
					<div className="path-plan-topline">
						<h1 className="screen-title">Path Plan</h1>

						<div
							className="mode-toggle"
							role="tablist"
							aria-label="Plan mode"
						>
							<button
								type="button"
								role="tab"
								aria-selected={!experimentMode}
								className={`mode-toggle-button ${
									!experimentMode ? "is-active" : ""
								}`}
								onClick={() => setExperimentMode(false)}
							>
								View
							</button>
							<button
								type="button"
								role="tab"
								aria-selected={experimentMode}
								className={`mode-toggle-button ${
									experimentMode ? "is-active" : ""
								}`}
								onClick={() => setExperimentMode(true)}
							>
								Experiment
							</button>
						</div>
					</div>

					<div className="path-plan-subline">
						{experimentMode ? (
							<p className="screen-intro">
								Experimental degree plan.
							</p>
						) : (
							<p className="screen-intro">
								Optimized degree plan, given{" "}
								<button
									type="button"
									className="inline-link-button"
									onClick={highlightProfileUploadSection}
								>
									Uploaded degree audit
								</button>
								, and the{" "}
								<a
									href={REQUIREMENTS_URL}
									target="_blank"
									rel="noreferrer"
									className="inline-link-button"
								>
									{requirementsLinkLabel}
								</a>
								.
							</p>
						)}

						<div className="path-plan-header-summary">
							<p className="summary-item">
								<span className="summary-label">Credits</span>
								<span className="summary-value">
									{savedSnapshot.satisfiedCredits}/
									{TOTAL_DEGREE_CREDITS} completed
								</span>
								<span className="summary-subvalue">
									{savedSnapshot.inProgressCredits} in
									progress
								</span>
							</p>
							<p className="summary-item">
								<span className="summary-label">
									Projected Graduation
								</span>
								<span className="summary-value">
									{experimentMode
										? experimentSnapshot?.projectedGraduation
										: savedSnapshot.projectedGraduation}
								</span>
							</p>
						</div>
					</div>
				</header>

				<div className="path-plan-board">
					<div className="path-plan-calendar-wrap">
						<div className="path-plan-grid">
							<div />
							{TERM_ORDER.map((kind) => (
								<div
									key={kind}
									className="path-plan-term-heading"
								>
									{TERM_LABELS[kind]}
								</div>
							))}

							{yearRows.map((row) => (
								<Fragment key={row.key}>
									<div className="path-plan-year-label">
										{row.label}
									</div>

									{TERM_ORDER.map((kind) => {
										const derivedTerm = row.terms[kind];
										const termId = derivedTerm?.term.id;
										const canDrop = termId
											? canInteractWithTerm(termId)
											: false;
										const isDropTarget =
											termId !== undefined &&
											draggingTermId === termId;

										return (
											<div
												key={`${row.key}-${kind}`}
												className={`path-plan-term ${
													canDrop
														? "is-future"
														: "is-past"
												} ${
													isDropTarget
														? "is-drop-target"
														: ""
												}`}
												onDragOver={(event) => {
													if (!canDrop || !termId)
														return;
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
													handleTermDrop(
														termId,
														event,
													);
												}}
											>
												{termId
													? renderPlacedBlock(termId)
													: null}
												{derivedTerm?.courses.map(
													(course) =>
														renderCourse(
															course,
															derivedTerm.term.id,
														),
												)}
											</div>
										);
									})}
								</Fragment>
							))}
						</div>
					</div>

					<aside className="path-plan-blocks">
						<div className="rail-section">
							<p className="block-label">
								{experimentMode ? "Blocks" : "Experiment"}
							</p>
							{experimentMode ? (
								<div className="block-list">
									{renderPaletteBlock("work-term")}
									{renderPaletteBlock("internship")}
									{renderPaletteBlock("time-off")}
								</div>
							) : (
								<div className="rail-copy-group">
									<p className="rail-copy">
										Turn on experiment mode to drag co-op,
										internship, or time-off blocks into
										future terms.
									</p>
									<button
										type="button"
										className="plan-action-button plan-action-button--primary"
										onClick={() => setExperimentMode(true)}
									>
										Enter experiment mode
									</button>
								</div>
							)}
						</div>

						<div className="rail-section rail-section--divided">
							<p className="block-label">Plan Signals</p>
							{snapshot.warnings.length > 0 ? (
								<ul className="signal-list">
									{snapshot.warnings
										.slice(0, 6)
										.map((warning) => (
											<li
												key={warning}
												className="signal-item"
											>
												{warning}
											</li>
										))}
								</ul>
							) : (
								<p className="rail-copy">
									No modeled scheduling issues in the current
									scenario.
								</p>
							)}
						</div>

						<div className="rail-section rail-section--divided">
							<div className="saved-scenario-header">
								<p className="block-label">Saved Scenarios</p>
								<span className="saved-scenario-count">
									{savedScenarios.length}
								</span>
							</div>
							{savedScenarios.length > 0 ? (
								<ul className="saved-scenario-list">
									{savedScenarios.map((scenario) => (
										<li
											key={scenario.id}
											className={`saved-scenario-row ${
												activeScenarioId === scenario.id
													? "is-active"
													: ""
											}`}
										>
											<button
												type="button"
												className="saved-scenario-select"
												onClick={() =>
													loadSavedScenario(
														scenario.id,
													)
												}
											>
												<strong className="saved-scenario-title">
													{scenario.title}
												</strong>
												<span className="saved-scenario-meta">
													Projected grad{" "}
													{
														scenario.projectedGraduation
													}
												</span>
												<span className="saved-scenario-meta">
													{scenario.signalCount}{" "}
													{scenario.signalCount === 1
														? "signal"
														: "signals"}
												</span>
											</button>
											<button
												type="button"
												aria-label={`Delete ${scenario.title}`}
												className="saved-scenario-delete"
												onClick={() =>
													deleteSavedScenario(
														scenario.id,
													)
												}
											>
												Delete
											</button>
										</li>
									))}
								</ul>
							) : (
								<p className="rail-copy">
									Saved what-if paths will appear here.
								</p>
							)}
						</div>
					</aside>
				</div>

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
							onClick={() =>
								removeBlockGroup(blockContextMenu.groupId)
							}
						>
							Delete block
						</button>
					</div>
				) : null}

				{experimentMode && isDirty ? (
					<div className="floating-plan-actions">
						<button
							type="button"
							className="plan-action-button"
							onClick={resetPlan}
						>
							Reset
						</button>
						<button
							type="button"
							className="plan-action-button plan-action-button--primary"
							onClick={openSaveScenarioModal}
						>
							Save scenario
						</button>
					</div>
				) : null}

				{saveScenarioModal.isOpen ? (
					<div
						className="modal-backdrop"
						role="presentation"
						onClick={() =>
							setSaveScenarioModal((current) => ({
								...current,
								isOpen: false,
							}))
						}
					>
						<div
							role="dialog"
							aria-modal="true"
							aria-labelledby="save-scenario-title"
							className="save-scenario-modal"
							onClick={(event) => event.stopPropagation()}
						>
							<h2
								id="save-scenario-title"
								className="save-scenario-title"
							>
								Save scenario
							</h2>
							<p className="save-scenario-copy">
								Give this path a name so you can reopen it later
								without changing the current plan.
							</p>
							<label className="form-field">
								<span className="profile-label">
									Scenario Name
								</span>
								<input
									autoFocus
									type="text"
									value={saveScenarioModal.value}
									className="profile-input"
									onChange={(event) =>
										setSaveScenarioModal((current) => ({
											...current,
											value: event.target.value,
										}))
									}
								/>
							</label>
							<div className="modal-actions">
								<button
									type="button"
									className="plan-action-button"
									onClick={() =>
										setSaveScenarioModal((current) => ({
											...current,
											isOpen: false,
										}))
									}
								>
									Cancel
								</button>
								<button
									type="button"
									className="plan-action-button plan-action-button--primary"
									onClick={saveScenario}
								>
									Save scenario
								</button>
							</div>
						</div>
					</div>
				) : null}
			</section>
		);
	}

	function renderSearch() {
		if (!profile || !savedSnapshot) return null;

		return (
			<section className="pathwise-screen">
				<header className="screen-header">
					<h1 className="screen-title">Co-op Search</h1>
					<p className="screen-intro">
						TermShift ranks work terms using the courses already on
						your transcript, then lets you test a listing directly
						in the planner before you commit to that scenario.
					</p>
				</header>

				<div className="search-layout">
					<div className="search-list-wrap">
						<p className="block-label">Suggested Listings</p>
						<ul className="search-list">
							{opportunityPreviews.map((opportunity) => (
								<li
									key={opportunity.id}
									className={`search-row ${
										activeSearchOpportunity?.id ===
										opportunity.id
											? "is-active"
											: ""
									}`}
								>
									<button
										type="button"
										className="search-row-select"
										onClick={() =>
											setBrowseOpportunityId(
												opportunity.id,
											)
										}
									>
										<span className="search-row-topline">
											{opportunity.company} ·{" "}
											{opportunity.location}
										</span>
										<strong className="search-row-title">
											{opportunity.title}
										</strong>
										<span className="search-row-meta">
											{opportunity.termLabel} · fit score{" "}
											{opportunity.fitScore}
										</span>
										<span className="search-row-meta">
											Modeled graduation:{" "}
											{opportunity.projectedGraduation}
										</span>
									</button>
									<button
										type="button"
										className="plan-action-button"
										onClick={() =>
											applyOpportunityScenario(
												opportunity,
											)
										}
									>
										Test in plan
									</button>
								</li>
							))}
						</ul>
					</div>

					{activeSearchOpportunity ? (
						<aside className="search-detail">
							<p className="block-label">Selected Listing</p>
							<h2 className="search-detail-title">
								{activeSearchOpportunity.title}
							</h2>
							<p className="search-detail-company">
								{activeSearchOpportunity.company} ·{" "}
								{activeSearchOpportunity.location}
							</p>
							<p className="search-detail-company">
								{activeSearchOpportunity.termLabel}
							</p>

							<div className="tag-row">
								{activeSearchOpportunity.focusAreas.map(
									(focusArea) => (
										<span
											key={focusArea}
											className="tag-pill"
										>
											{focusArea}
										</span>
									),
								)}
							</div>

							<p className="search-detail-copy">
								{activeSearchOpportunity.summary}
							</p>

							<div className="detail-section">
								<p className="block-label">Why It Fits</p>
								<p className="rail-copy">
									{activeSearchOpportunity.matchedCourseCodes
										.length > 0
										? `Matched coursework: ${activeSearchOpportunity.matchedCourseCodes.join(
												", ",
										  )}.`
										: "This listing is forward-looking for your current coursework profile."}
								</p>
								{activeSearchOpportunity.missingCourseCodes
									.length > 0 ? (
									<p className="rail-copy">
										Gaps TermShift still sees:{" "}
										{activeSearchOpportunity.missingCourseCodes.join(
											", ",
										)}
										.
									</p>
								) : null}
							</div>

							<div className="detail-section">
								<p className="block-label">See In Plan</p>
								<p className="rail-copy">
									Baseline graduation is{" "}
									{savedSnapshot.projectedGraduation}. If you
									test this work term now, the modeled path
									moves to{" "}
									{
										activeSearchOpportunity.projectedGraduation
									}
									.
								</p>
								{activeSearchOpportunity.signalCount > 0 ? (
									<ul className="signal-list">
										{activeSearchOpportunity.topSignals.map(
											(signal) => (
												<li
													key={signal}
													className="signal-item"
												>
													{signal}
												</li>
											),
										)}
									</ul>
								) : (
									<p className="rail-copy">
										This scenario does not surface modeled
										scheduling issues.
									</p>
								)}
							</div>

							<div className="detail-actions">
								<button
									type="button"
									className="plan-action-button plan-action-button--primary"
									onClick={() =>
										applyOpportunityScenario(
											activeSearchOpportunity,
										)
									}
								>
									Test in plan
								</button>
								<button
									type="button"
									className="plan-action-button"
									onClick={() => navigateToView("plan")}
								>
									Go to current plan
								</button>
							</div>
						</aside>
					) : null}
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
					aria-label={
						sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
					}
					onClick={() => setSidebarCollapsed((current) => !current)}
				>
					{sidebarCollapsed ? "→" : "←"}
				</button>

				{sidebarCollapsed ? null : (
					<nav className="pathwise-nav" aria-label="Primary">
						<button
							type="button"
							aria-current={
								activeView === "profile" ? "page" : undefined
							}
							className={`pathwise-nav-button ${
								activeView === "profile" ? "is-active" : ""
							}`}
							onClick={() => navigateToView("profile")}
						>
							Profile
						</button>
						<button
							type="button"
							aria-current={
								activeView === "plan" ? "page" : undefined
							}
							className={`pathwise-nav-button ${
								activeView === "plan" ? "is-active" : ""
							} ${profile ? "" : "is-disabled"}`}
							onClick={() => navigateToView("plan")}
						>
							Plan
						</button>
						<button
							type="button"
							aria-current={
								activeView === "search" ? "page" : undefined
							}
							className={`pathwise-nav-button ${
								activeView === "search" ? "is-active" : ""
							} ${profile ? "" : "is-disabled"}`}
							onClick={() => navigateToView("search")}
						>
							Search
						</button>
					</nav>
				)}
			</aside>

			<div className="pathwise-content">
				{activeView === "profile" ? renderProfileScreen() : null}
				{activeView === "plan" ? renderPathPlan() : null}
				{activeView === "search" ? renderSearch() : null}
			</div>
		</main>
	);
}
