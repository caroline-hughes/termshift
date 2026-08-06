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
	COURSE_MAP,
	DEMO_PROFILES,
	DEFAULT_PLANNER_STATE,
	REQUIREMENTS_URL,
	TOTAL_DEGREE_CREDITS,
	buildProfileFromUpload,
	getTermIndex,
	getTermPattern,
} from "@/lib/pathwise-data";
import { derivePlannerSnapshot } from "@/lib/pathwise-planner";
import {
	buildPlanAssessment,
	type PlanInsight,
} from "@/lib/termshift-plan-assessment";
import {
	buildOpportunitySuggestions,
	scoreOpportunity,
	type OpportunitySuggestion,
	type WorkOpportunity,
} from "@/lib/termshift-opportunities";
import { TermShiftLogo } from "@/components/termshift-logo";
import type {
	CourseRequirement,
	CourseBucket,
	DerivedTerm,
	PlannerSnapshot,
	PlannerState,
	ScheduledCourse,
	SpecialBlockType,
	StudentProfile,
	TermKind,
} from "@/lib/pathwise-types";

type ActiveView = "profile" | "plan" | "search";
type ResizeEdge = "start" | "end";
type SchoolOption = "" | "Northeastern University" | "Columbia University";
type MajorOption = "" | "BS CS" | "MS AI";
type DemoProfileKey = "inProgress" | "sophomore";
type SampleAuditKey = "columbiaMsai" | "northeasternBscs";

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
	major: MajorOption;
	school: SchoolOption;
};

type ProcessingState = {
	documentName: string;
	documentUrl: string;
	phase: "loading" | "scanning";
};

type UploadState = {
	message: string;
	selectedFileName: string;
	status: "error" | "idle" | "processing" | "ready";
};

type PersistedSession = {
	activeScenarioId: string | null;
	draftFingerprint?: string;
	experimentMode: boolean;
	identity: IdentityState;
	plannerState: PlannerState;
	profile: StudentProfile | null;
	savedPlannerState: PlannerState;
	savedScenarios: SavedScenario[];
	selectedOpportunityId: string | null;
	uploadedDocumentUrl?: string | null;
};

type OpportunityPreview = OpportunitySuggestion & {
	issueCount: number;
	projectedGraduation: string;
	topIssues: string[];
};

type SavedScenario = {
	id: string;
	issueCount: number;
	opportunityId: string | null;
	plannerState: PlannerState;
	projectedGraduation: string;
	title: string;
	topIssues: string[];
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

type ImportedJobFormState = {
	message: string;
	status: "error" | "idle" | "loading";
	url: string;
};

type InsightActionOption = {
	description?: string;
	id: string;
	label: string;
	message: string;
	plannerState: PlannerState;
	selectedOpportunityId: string | null;
};

type InsightUiAction =
	| {
			kind: "fix";
			label: string;
			option: InsightActionOption;
	  }
	| {
			emptyMessage?: string;
			kind: "options";
			label: string;
			options: InsightActionOption[];
	  };

type UndoPlannerAction = {
	activeScenarioId: string | null;
	browseOpportunityId: string | null;
	message: string;
	plannerState: PlannerState;
	selectedOpportunityId: string | null;
};

type ScenarioReturnState = {
	activeScenarioId: string | null;
	browseOpportunityId: string | null;
	draftFingerprint: string;
	experimentMode: boolean;
	plannerState: PlannerState;
	selectedOpportunityId: string | null;
};

type ParseJobResponse = {
	opportunity: WorkOpportunity;
};

type RailSectionKey =
	| "blocks"
	| "insights"
	| "savedScenarios";

type SnapshotBlockGroup = {
	endTermId: string;
	startTermId: string;
	termIds: string[];
	type: SpecialBlockType;
};

const APP_STORAGE_KEY = "termshift-session-v2";
const LEGACY_STORAGE_KEYS = [
	"termshift-session-v1",
	"pathwise-session-v1",
];

const TERM_ORDER: TermKind[] = ["fall", "spring", "summer1", "summer2"];
const SCHOOL_OPTIONS: Exclude<SchoolOption, "">[] = [
	"Northeastern University",
	"Columbia University",
];
const MAJOR_OPTIONS_BY_SCHOOL: Record<
	Exclude<SchoolOption, "">,
	Exclude<MajorOption, "">[]
> = {
	"Columbia University": ["MS AI"],
	"Northeastern University": ["BS CS"],
};
const MAJOR_LABELS: Record<Exclude<MajorOption, "">, string> = {
	"BS CS": "B.S. in Computer Science",
	"MS AI": "M.S. in Artificial Intelligence",
};
const PROGRAM_LABELS: Record<Exclude<MajorOption, "">, string> = {
	"BS CS": "B.S. in Computer Science",
	"MS AI": "M.S. in Artificial Intelligence",
};
const SAMPLE_AUDITS: Record<
	SampleAuditKey,
	{
		defaultFullName: string;
		documentName: string;
		label: string;
		major: Exclude<MajorOption, "">;
		school: Exclude<SchoolOption, "">;
		seedProfileKey?: DemoProfileKey;
		url: string;
	}
> = {
	columbiaMsai: {
		defaultFullName: "Jane Doe",
		documentName: "jane-doe-columbia-msai-degree-audit.pdf",
		label: "Example degree audit",
		major: "MS AI",
		school: "Columbia University",
		url: "/demo-transcripts/jane-doe-columbia-msai-degree-audit.pdf",
	},
	northeasternBscs: {
		defaultFullName: "Caroline Hughes",
		documentName: "caroline-hughes-northeastern-unofficial-transcript.pdf",
		label: "Example degree audit",
		major: "BS CS",
		school: "Northeastern University",
		seedProfileKey: "sophomore",
		url: "/demo-transcripts/caroline-hughes-northeastern-unofficial-transcript.pdf",
	},
};

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
		fullName: "",
		major: "",
		school: "",
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

const DEFAULT_PLANNER_FINGERPRINT = serializePlannerState(
	DEFAULT_PLANNER_STATE,
);

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

function areTermsVisuallyAdjacent(leftTermId: string, rightTermId: string) {
	const leftTerm = ACADEMIC_TERMS[getTermIndex(leftTermId)];
	const rightTerm = ACADEMIC_TERMS[getTermIndex(rightTermId)];

	if (!leftTerm || !rightTerm) return false;

	return (
		getAcademicYearKey(leftTerm) === getAcademicYearKey(rightTerm) &&
		TERM_ORDER.indexOf(rightTerm.kind) ===
			TERM_ORDER.indexOf(leftTerm.kind) + 1
	);
}

function buildAcademicYearLabel(startYear: number) {
	return `${startYear}\u2013${String(startYear + 1).slice(-2)}`;
}

function buildYearRows(terms: DerivedTerm[]): YearRow[] {
	const rows = new Map<number, YearRow>();

	for (const derivedTerm of terms) {
		const key = getAcademicYearKey(derivedTerm.term);

		if (!rows.has(key)) {
			rows.set(key, {
				key,
				label: buildAcademicYearLabel(key),
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

function buildFullTermPair(termIds: Array<string | null>) {
	const resolved = termIds.filter(Boolean) as string[];
	return resolved.length === 2 ? resolved : [];
}

function getDefaultWorkTermSpan(
	termId: string,
	isTermAvailable?: (termId: string) => boolean,
) {
	const term = ACADEMIC_TERMS[getTermIndex(termId)];
	if (!term) return [];

	const candidateSpans: string[][] = [];

	if (term.kind === "spring") {
		candidateSpans.push(buildFullTermPair([termId, getTermIdAtOffset(termId, 1)]));
	} else if (term.kind === "summer1") {
		// Prefer the standard Spring + Summer 1 co-op window, but if Spring is
		// already locked or unavailable, still allow Summer 1 + Summer 2.
		candidateSpans.push(buildFullTermPair([getTermIdAtOffset(termId, -1), termId]));
		candidateSpans.push(buildFullTermPair([termId, getTermIdAtOffset(termId, 1)]));
	} else if (term.kind === "summer2") {
		candidateSpans.push(buildFullTermPair([termId, getTermIdAtOffset(termId, 1)]));
	} else {
		candidateSpans.push(buildFullTermPair([getTermIdAtOffset(termId, -1), termId]));
	}

	if (!isTermAvailable) {
		return candidateSpans.find((span) => span.length === 2) ?? [];
	}

	return (
		candidateSpans.find(
			(span) => span.length === 2 && span.every((candidate) => isTermAvailable(candidate)),
		) ?? []
	);
}

function getDefaultBlockSpan(
	termId: string,
	blockType: SpecialBlockType,
	isTermAvailable?: (termId: string) => boolean,
) {
	if (blockType === "work-term") {
		return getDefaultWorkTermSpan(termId, isTermAvailable);
	}

	return [termId];
}

function getProjectedGraduationTermId(snapshot: PlannerSnapshot) {
	return (
		[...snapshot.terms].reverse().find((term) => term.courses.length > 0)
			?.term.id ?? null
	);
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
			currentGroup.termIds.push(term.term.id);
			continue;
		}

		currentGroup = {
			endTermId: term.term.id,
			startTermId: term.term.id,
			termIds: [term.term.id],
			type: term.specialBlock,
		};
		groups.push(currentGroup);
	}

	return groups;
}

function buildTermIssueMap(insights: PlanInsight[]) {
	const issuesByTerm = new Map<string, PlanInsight[]>();

	for (const insight of insights) {
		if (!insight.linkedTermId || insight.tone === "neutral") continue;

		const existing = issuesByTerm.get(insight.linkedTermId) ?? [];
		existing.push(insight);
		issuesByTerm.set(insight.linkedTermId, existing);
	}

	return issuesByTerm;
}

function getIssueToneClass(tone: PlanInsight["tone"]) {
	if (tone === "critical") return "is-critical";
	if (tone === "warning") return "is-warning";
	return "is-neutral";
}

function buildDemoProfile(
	fileName: string,
	profileKey: DemoProfileKey = "sophomore",
) {
	return {
		...DEMO_PROFILES[profileKey],
		uploadedAt: new Date().toISOString(),
		uploadedFileName: fileName,
		parserNote:
			profileKey === "inProgress"
				? "Used the seeded Northeastern in-progress profile for the MVP demo state."
				: "Used the seeded Northeastern sophomore profile for the MVP demo state.",
	};
}

function findSampleAuditByDocumentName(fileName: string) {
	return (
		Object.values(SAMPLE_AUDITS).find(
			(sampleAudit) => sampleAudit.documentName === fileName,
		) ?? null
	);
}

function getSampleAuditKeyForSelection(
	school: SchoolOption,
	major: MajorOption,
): SampleAuditKey | null {
	if (school === "Northeastern University" && major === "BS CS") {
		return "northeasternBscs";
	}

	if (school === "Columbia University" && major === "MS AI") {
		return "columbiaMsai";
	}

	return null;
}

function applyIdentityToProfile(
	baseProfile: StudentProfile,
	identity: IdentityState,
): StudentProfile {
	const school = identity.school || baseProfile.school;
	const program =
		identity.major && identity.major in PROGRAM_LABELS
			? PROGRAM_LABELS[identity.major as Exclude<MajorOption, "">]
			: baseProfile.program;
	const parserNote =
		school === "Northeastern University"
			? baseProfile.parserNote
			: `${baseProfile.parserNote} Degree-path modeling in this MVP is still seeded to Northeastern CS requirements while TermShift's onboarding and co-op search stay school-aware.`;

	return {
		...baseProfile,
		label: `${identity.fullName || "Demo Student"} · academic snapshot`,
		program,
		school,
		parserNote,
	};
}

function delay(ms: number) {
	return new Promise((resolve) => {
		window.setTimeout(resolve, ms);
	});
}

function ArrowRightIcon({ className = "" }: { className?: string }) {
	return (
		<svg
			aria-hidden="true"
			className={className}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="M5 12h12" />
			<path d="m13 6 6 6-6 6" />
		</svg>
	);
}

function readFileAsDataUrl(file: File) {
	return new Promise<string>((resolve, reject) => {
		const reader = new FileReader();

		reader.onload = () => {
			if (typeof reader.result === "string") {
				resolve(reader.result);
				return;
			}

			reject(new Error("Unable to read file."));
		};

		reader.onerror = () => {
			reject(reader.error ?? new Error("Unable to read file."));
		};

		reader.readAsDataURL(file);
	});
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
	const [highlightedInsightId, setHighlightedInsightId] = useState<
		string | null
	>(null);
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
	const [scenarioReturnState, setScenarioReturnState] =
		useState<ScenarioReturnState | null>(null);
	const [expandedInsightId, setExpandedInsightId] = useState<string | null>(
		null,
	);
	const [draftFingerprint, setDraftFingerprint] = useState(
		DEFAULT_PLANNER_FINGERPRINT,
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
	const [demoMaterialsOpen, setDemoMaterialsOpen] = useState(false);
	const [processingState, setProcessingState] =
		useState<ProcessingState | null>(null);
	const [processingIsExiting, setProcessingIsExiting] = useState(false);
	const [lockedTermPopup, setLockedTermPopup] = useState<string | null>(null);
	const [saveScenarioModal, setSaveScenarioModal] =
		useState<SaveScenarioModalState>({
			defaultTitle: "",
			isOpen: false,
			value: "",
		});
	const [importedJobForm, setImportedJobForm] =
		useState<ImportedJobFormState>({
			message: "",
			status: "idle",
			url: "",
		});
	const [importedOpportunityPreview, setImportedOpportunityPreview] =
		useState<OpportunityPreview | null>(null);
	const [collapsedRailSections, setCollapsedRailSections] = useState<
		Record<RailSectionKey, boolean>
	>({
		blocks: false,
		insights: false,
		savedScenarios: true,
	});
	const [uploadedDocumentUrl, setUploadedDocumentUrl] = useState<
		string | null
	>(null);
	const [highlightedProfileSection, setHighlightedProfileSection] = useState<
		"upload" | null
	>(null);
	const [undoPlannerAction, setUndoPlannerAction] =
		useState<UndoPlannerAction | null>(null);
	const [undoPlannerActionIsClosing, setUndoPlannerActionIsClosing] =
		useState(false);
	const [pendingUpload, setPendingUpload] = useState<File | null>(null);
	const [didHydrate, setDidHydrate] = useState(false);
	const insightItemRefs = useRef<Map<string, HTMLLIElement | null>>(
		new Map(),
	);
	const uploadedDocumentUrlRef = useRef<string | null>(null);
	const profileHighlightTimeoutRef = useRef<number | null>(null);
	const processingExitTimeoutRef = useRef<number | null>(null);
	const lockedTermPopupTimeoutRef = useRef<number | null>(null);
	const processingRunRef = useRef(0);

	useEffect(() => {
		let cancelled = false;

		window.setTimeout(() => {
			if (cancelled) return;

			for (const legacyKey of LEGACY_STORAGE_KEYS) {
				if (legacyKey !== APP_STORAGE_KEY) {
					window.localStorage.removeItem(legacyKey);
				}
			}

			const raw = window.localStorage.getItem(APP_STORAGE_KEY);
			if (!raw) {
				setDidHydrate(true);
				return;
			}

			try {
				const parsed = JSON.parse(raw) as PersistedSession;
				const hydratedScenarios = (parsed.savedScenarios ?? []).map(
					(scenario) => ({
						...scenario,
						issueCount:
							scenario.issueCount ??
							(
								scenario as SavedScenario & {
									signalCount?: number;
								}
							).signalCount ??
							0,
						plannerState: clonePlannerState(scenario.plannerState),
						topIssues:
							scenario.topIssues ??
							(
								scenario as SavedScenario & {
									topSignals?: string[];
								}
							).topSignals ??
						[],
					}),
				);
				const hydratedActiveScenario = parsed.activeScenarioId
					? hydratedScenarios.find(
							(scenario) =>
								scenario.id === parsed.activeScenarioId,
					  ) ?? null
					: null;

				if (parsed.identity) {
					setIdentity({
						...createDefaultIdentity(),
						...parsed.identity,
						major: parsed.identity.major ?? "",
						school: parsed.identity.school ?? "",
					});
				}

				if (parsed.profile) {
					setProfile(parsed.profile);
					replaceUploadedDocumentUrl(
						parsed.uploadedDocumentUrl ??
							findSampleAuditByDocumentName(
								parsed.profile.uploadedFileName,
							)?.url ??
							null,
					);
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

				setSavedScenarios(hydratedScenarios);
				setActiveScenarioId(parsed.activeScenarioId ?? null);
				setSelectedOpportunityId(parsed.selectedOpportunityId ?? null);
				setExperimentMode(parsed.experimentMode ?? false);
				setDraftFingerprint(
					parsed.draftFingerprint ??
						(hydratedActiveScenario
							? serializePlannerState(
									hydratedActiveScenario.plannerState,
							  )
							: parsed.savedPlannerState
								? serializePlannerState(parsed.savedPlannerState)
								: DEFAULT_PLANNER_FINGERPRINT),
				);
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
			draftFingerprint,
			experimentMode,
			identity,
			plannerState,
			profile,
			savedPlannerState,
			savedScenarios,
			selectedOpportunityId,
			uploadedDocumentUrl,
		};

		window.localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(session));
	}, [
		didHydrate,
		activeScenarioId,
		draftFingerprint,
		experimentMode,
		identity,
		plannerState,
		profile,
		savedPlannerState,
		savedScenarios,
		selectedOpportunityId,
		uploadedDocumentUrl,
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
		if (!undoPlannerAction) {
			setUndoPlannerActionIsClosing(false);
			return;
		}

		setUndoPlannerActionIsClosing(false);

		const fadeTimer = window.setTimeout(() => {
			setUndoPlannerActionIsClosing(true);
		}, 1400);
		const clearTimer = window.setTimeout(() => {
			setUndoPlannerAction(null);
			setUndoPlannerActionIsClosing(false);
		}, 1900);

		return () => {
			window.clearTimeout(fadeTimer);
			window.clearTimeout(clearTimer);
		};
	}, [undoPlannerAction]);

	useEffect(() => {
		return () => {
			processingRunRef.current += 1;

			if (profileHighlightTimeoutRef.current) {
				window.clearTimeout(profileHighlightTimeoutRef.current);
			}

			if (processingExitTimeoutRef.current) {
				window.clearTimeout(processingExitTimeoutRef.current);
			}

			if (lockedTermPopupTimeoutRef.current) {
				window.clearTimeout(lockedTermPopupTimeoutRef.current);
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
	const activeSavedScenario =
		savedScenarios.find((scenario) => scenario.id === activeScenarioId) ??
		null;
	const isViewingSavedScenario = Boolean(activeSavedScenario);
	const snapshot = isViewingSavedScenario
		? experimentSnapshot
		: experimentMode
			? experimentSnapshot
			: savedSnapshot;
	const displayedPlannerState = isViewingSavedScenario
		? plannerState
		: experimentMode
			? plannerState
			: savedPlannerState;
	const yearRows = profile && snapshot ? buildYearRows(snapshot.terms) : [];
	const lockedThroughIndex = profile
		? getTermIndex(profile.lockedThroughTermId)
		: -1;
	const blockGroups = buildBlockGroups(displayedPlannerState.placedBlocks);
	const blockLabels = buildBlockLabels(blockGroups.byGroupId);
	const opportunityPreviews: OpportunityPreview[] = profile
		? buildOpportunitySuggestions(profile).flatMap((opportunity) => {
				const preview = buildOpportunityPreviewForSearch(opportunity);
				return preview ? [preview] : [];
		  })
		: [];
	const combinedOpportunityPreviews = importedOpportunityPreview
		? [importedOpportunityPreview, ...opportunityPreviews]
		: opportunityPreviews;

	const selectedOpportunity =
		combinedOpportunityPreviews.find(
			(opportunity) => opportunity.id === selectedOpportunityId,
		) ?? null;
	const activeSearchOpportunity =
		combinedOpportunityPreviews.find(
			(opportunity) => opportunity.id === browseOpportunityId,
		) ??
		combinedOpportunityPreviews[0] ??
		null;

	const currentFingerprint = serializePlannerState(plannerState);
	const isDirty = currentFingerprint !== draftFingerprint;
	const requirementsLinkLabel = "Degree requirements";
	const availableMajorOptions = identity.school
		? MAJOR_OPTIONS_BY_SCHOOL[identity.school]
		: [];
	const landingIntakeReady =
		identity.fullName.trim().length > 0 &&
		Boolean(identity.school) &&
		Boolean(identity.major);
	const selectedSampleAuditKey = getSampleAuditKeyForSelection(
		identity.school,
		identity.major,
	);
	const selectedSampleAudit = selectedSampleAuditKey
		? SAMPLE_AUDITS[selectedSampleAuditKey]
		: null;
	const planAssessment =
		profile && snapshot && savedSnapshot
			? buildPlanAssessment({
					baselineSnapshot: savedSnapshot,
					experimentMode: experimentMode || isViewingSavedScenario,
					profile,
					selectedOpportunity:
						experimentMode || isViewingSavedScenario
						? selectedOpportunity
							: null,
					snapshot,
			  })
			: null;
	const termIssueMap = planAssessment
		? buildTermIssueMap(planAssessment.insights)
		: new Map<string, PlanInsight[]>();
	const workingPlannerState =
		experimentMode || isViewingSavedScenario
			? plannerState
			: savedPlannerState;
	const workingSelectedOpportunityId =
		experimentMode || isViewingSavedScenario
			? selectedOpportunityId
			: null;

	function isFutureTerm(termId: string) {
		return profile ? getTermIndex(termId) > lockedThroughIndex : false;
	}

	function getSnapshotTerm(
		sourceSnapshot: PlannerSnapshot,
		termId: string,
	) {
		return (
			sourceSnapshot.terms.find((term) => term.term.id === termId) ?? null
		);
	}

	function getPrerequisiteIssueCount(sourceInsights: PlanInsight[]) {
		return sourceInsights.filter((insight) => insight.id.startsWith("prereq-"))
			.length;
	}

	function getPlannedCoursePlacements(sourceSnapshot: PlannerSnapshot) {
		return sourceSnapshot.terms.flatMap((term) =>
			term.courses
				.filter((course) => course.status === "planned")
				.map((course) => ({
					course,
					termId: term.term.id,
				})),
		);
	}

	function buildPinnedCourseState(
		baseState: PlannerState,
		courseId: string,
		termId: string,
	) {
		return {
			placedBlocks: { ...baseState.placedBlocks },
			pinnedCourses: {
				...baseState.pinnedCourses,
				[courseId]: termId,
			},
		};
	}

	function simulatePlannerState(
		nextPlannerState: PlannerState,
		nextSelectedOpportunityId: string | null = workingSelectedOpportunityId,
	) {
		if (!profile || !savedSnapshot) return null;

		const normalizedState = clonePlannerState(nextPlannerState);
		const nextSnapshot = derivePlannerSnapshot(profile, normalizedState);
		const nextSelectedOpportunity =
			combinedOpportunityPreviews.find(
				(opportunity) => opportunity.id === nextSelectedOpportunityId,
			) ?? null;
		const nextAssessment = buildPlanAssessment({
			baselineSnapshot: savedSnapshot,
			experimentMode: true,
			profile,
			selectedOpportunity: nextSelectedOpportunity,
			snapshot: nextSnapshot,
		});

		return {
			assessment: nextAssessment,
			plannerState: normalizedState,
			selectedOpportunityId: nextSelectedOpportunityId,
			snapshot: nextSnapshot,
		};
	}

	function applyInsightOption(option: InsightActionOption) {
		setUndoPlannerAction({
			activeScenarioId,
			browseOpportunityId,
			message: option.message,
			plannerState: clonePlannerState(workingPlannerState),
			selectedOpportunityId: workingSelectedOpportunityId,
		});
		setUndoPlannerActionIsClosing(false);
		setBlockContextMenu(null);
		setExpandedInsightId(null);
		setExperimentMode(true);
		setPlannerState(clonePlannerState(option.plannerState));
		setSelectedOpportunityId(option.selectedOpportunityId);
		setActiveScenarioId(null);
		setScenarioReturnState(null);
	}

	function undoLastInsightAction() {
		if (!undoPlannerAction) return;

		setPlannerState(clonePlannerState(undoPlannerAction.plannerState));
		setSelectedOpportunityId(undoPlannerAction.selectedOpportunityId);
		setBrowseOpportunityId(undoPlannerAction.browseOpportunityId);
		setActiveScenarioId(undoPlannerAction.activeScenarioId);
		setExperimentMode(true);
		setUndoPlannerActionIsClosing(false);
		setUndoPlannerAction(null);
	}

	function buildInsightActionOption(
		id: string,
		label: string,
		message: string,
		nextPlannerState: PlannerState,
		description?: string,
		nextSelectedOpportunityId: string | null = workingSelectedOpportunityId,
	): InsightActionOption {
		return {
			description,
			id,
			label,
			message,
			plannerState: clonePlannerState(nextPlannerState),
			selectedOpportunityId: nextSelectedOpportunityId,
		};
	}

	function buildTimelineTargetTermIds(sourceSnapshot: PlannerSnapshot) {
		const experientialGroup = buildSnapshotBlockGroups(sourceSnapshot).find(
			(group) =>
				group.type === "work-term" || group.type === "internship",
		);
		if (!experientialGroup) return [];

		const endTerm = ACADEMIC_TERMS[getTermIndex(experientialGroup.endTermId)];
		if (!endTerm) return [];

		const candidateTermIds =
			endTerm.kind === "fall"
				? [`${endTerm.year + 1}-summer1`, `${endTerm.year + 1}-summer2`]
				: endTerm.kind === "spring"
					? [`${endTerm.year}-summer1`, `${endTerm.year}-summer2`]
					: endTerm.kind === "summer1"
						? [`${endTerm.year}-summer2`]
						: [
								`${endTerm.year + 1}-spring`,
								`${endTerm.year + 1}-summer1`,
						  ];

		return candidateTermIds.filter(
			(termId) =>
				ACADEMIC_TERMS.some((term) => term.id === termId) &&
				isFutureTerm(termId),
		);
	}

	function buildTimelineOption(
		targetTermId: string,
		sourceSnapshot: PlannerSnapshot,
		sourceAssessment: typeof planAssessment,
	) {
		if (!sourceAssessment) return null;

		const targetTerm = getSnapshotTerm(sourceSnapshot, targetTermId);
		const targetAcademicTerm =
			ACADEMIC_TERMS[getTermIndex(targetTermId)] ?? null;
		const currentGraduationTermId =
			getProjectedGraduationTermId(sourceSnapshot);
		const currentGraduationIndex = currentGraduationTermId
			? getTermIndex(currentGraduationTermId)
			: -1;
		const currentPrereqIssueCount = getPrerequisiteIssueCount(
			sourceAssessment.insights,
		);

		if (!targetTerm || !targetAcademicTerm || currentGraduationIndex === -1) {
			return null;
		}

		let bestCandidate:
			| {
					course: CourseRequirement;
					currentTermId: string;
					issueCount: number;
					nextGraduationIndex: number;
					option: InsightActionOption;
			  }
			| null = null;

		for (const { course, termId: currentTermId } of getPlannedCoursePlacements(
			sourceSnapshot,
		)) {
			if (course.id === "engw3302") continue;
			if (getTermIndex(currentTermId) <= getTermIndex(targetTermId)) continue;
			if (
				!course.allowedTerms.includes(
					getTermPattern(targetAcademicTerm.kind),
				)
			) {
				continue;
			}

			const simulation = simulatePlannerState(
				buildPinnedCourseState(
					workingPlannerState,
					course.id,
					targetTermId,
				),
			);
			if (!simulation) continue;

			const nextTargetTerm = getSnapshotTerm(
				simulation.snapshot,
				targetTermId,
			);
			const nextGraduationTermId = getProjectedGraduationTermId(
				simulation.snapshot,
			);
			const nextGraduationIndex = nextGraduationTermId
				? getTermIndex(nextGraduationTermId)
				: -1;

			if (
				!nextTargetTerm?.courses.some(
					(scheduledCourse) => scheduledCourse.id === course.id,
				) ||
				nextGraduationIndex === -1 ||
				nextGraduationIndex >= currentGraduationIndex ||
				nextTargetTerm.overload ||
				getPrerequisiteIssueCount(simulation.assessment.insights) >
					currentPrereqIssueCount
			) {
				continue;
			}

			const option = buildInsightActionOption(
				`timeline-${course.id}-${targetTermId}`,
				`Move ${course.code} to ${targetAcademicTerm.label}`,
				`Moved ${course.code} to ${targetAcademicTerm.label} to recover time.`,
				simulation.plannerState,
				`Reclaim time by pulling one planned course into ${targetAcademicTerm.label}.`,
				simulation.selectedOpportunityId,
			);

			if (
				!bestCandidate ||
				nextGraduationIndex < bestCandidate.nextGraduationIndex ||
				(nextGraduationIndex === bestCandidate.nextGraduationIndex &&
					simulation.assessment.issueCount < bestCandidate.issueCount) ||
				(nextGraduationIndex === bestCandidate.nextGraduationIndex &&
					simulation.assessment.issueCount ===
						bestCandidate.issueCount &&
					getTermIndex(currentTermId) >
						getTermIndex(bestCandidate.currentTermId))
			) {
				bestCandidate = {
					course,
					currentTermId,
					issueCount: simulation.assessment.issueCount,
					nextGraduationIndex,
					option,
				};
			}
		}

		return bestCandidate?.option ?? null;
	}

	function buildWritingInsightAction(sourceSnapshot: PlannerSnapshot) {
		const engwPlacement = getPlannedCoursePlacements(sourceSnapshot).find(
			({ course }) => course.id === "engw3302",
		);
		if (!engwPlacement) return null;

		const experientialGroups = buildSnapshotBlockGroups(sourceSnapshot).filter(
			(group) =>
				group.type === "work-term" || group.type === "internship",
		);
		const preferredTermIds = experientialGroups
			.sort((left, right) => {
				if (left.type === right.type) {
					return (
						getTermIndex(left.startTermId) -
						getTermIndex(right.startTermId)
					);
				}

				return left.type === "work-term" ? -1 : 1;
			})
			.flatMap((group) => group.termIds)
			.filter((termId) => isFutureTerm(termId));

		for (const termId of preferredTermIds) {
			const academicTerm = ACADEMIC_TERMS[getTermIndex(termId)];
			if (
				!academicTerm ||
				!COURSE_MAP.engw3302.allowedTerms.includes(
					getTermPattern(academicTerm.kind),
				)
			) {
				continue;
			}

			const simulation = simulatePlannerState(
				buildPinnedCourseState(
					workingPlannerState,
					"engw3302",
					termId,
				),
			);
			if (!simulation) continue;

			const targetTerm = getSnapshotTerm(simulation.snapshot, termId);
			const movedCourse = targetTerm?.courses.find(
				(course) => course.id === "engw3302",
			);

			if (
				!targetTerm?.specialBlock ||
				!movedCourse ||
				movedCourse.conflicts.some((conflict) =>
					conflict.startsWith("Prerequisite timing issue: "),
				)
			) {
				continue;
			}

			return {
				kind: "fix" as const,
				label: "Fix",
				option: buildInsightActionOption(
					`writing-${termId}`,
					`Move ENGW 3302 to ${academicTerm.label}`,
					`Moved ENGW 3302 into ${academicTerm.label}.`,
					simulation.plannerState,
					"Place Advanced Technical Writing inside the experiential term.",
					simulation.selectedOpportunityId,
				),
			};
		}

		return null;
	}

	function buildPrereqInsightAction(
		insight: PlanInsight,
		sourceSnapshot: PlannerSnapshot,
		sourceAssessment: typeof planAssessment,
	) {
		if (!insight.linkedTermId || !sourceAssessment) return null;

		const sourceTerm = getSnapshotTerm(sourceSnapshot, insight.linkedTermId);
		if (!sourceTerm) return null;

		const currentPrereqIssueCount = getPrerequisiteIssueCount(
			sourceAssessment.insights,
		);
		const currentGraduationTermId =
			getProjectedGraduationTermId(sourceSnapshot);
		const currentGraduationIndex = currentGraduationTermId
			? getTermIndex(currentGraduationTermId)
			: -1;

		let bestOption:
			| {
					issueCount: number;
					nextGraduationIndex: number;
					targetTermIndex: number;
					option: InsightActionOption;
			  }
			| null = null;

		for (const course of sourceTerm.courses.filter((scheduledCourse) =>
			scheduledCourse.conflicts.some((conflict) =>
				conflict.startsWith("Prerequisite timing issue: "),
			),
		)) {
			for (const targetTerm of ACADEMIC_TERMS) {
				const targetTermIndex = getTermIndex(targetTerm.id);
				if (
					targetTermIndex <= getTermIndex(sourceTerm.term.id) ||
					!isFutureTerm(targetTerm.id) ||
					!course.allowedTerms.includes(getTermPattern(targetTerm.kind))
				) {
					continue;
				}

				const simulation = simulatePlannerState(
					buildPinnedCourseState(
						workingPlannerState,
						course.id,
						targetTerm.id,
					),
				);
				if (!simulation) continue;

				const movedCourse = getSnapshotTerm(
					simulation.snapshot,
					targetTerm.id,
				)?.courses.find((scheduledCourse) => scheduledCourse.id === course.id);
				const nextPrereqIssueCount = getPrerequisiteIssueCount(
					simulation.assessment.insights,
				);
				const nextGraduationTermId = getProjectedGraduationTermId(
					simulation.snapshot,
				);
				const nextGraduationIndex = nextGraduationTermId
					? getTermIndex(nextGraduationTermId)
					: currentGraduationIndex;

				if (
					!movedCourse ||
					movedCourse.conflicts.some((conflict) =>
						conflict.startsWith("Prerequisite timing issue: "),
					) ||
					nextPrereqIssueCount >= currentPrereqIssueCount
				) {
					continue;
				}

				const option = buildInsightActionOption(
					`prereq-${course.id}-${targetTerm.id}`,
					`Move ${course.code} to ${targetTerm.label}`,
					`Moved ${course.code} to ${targetTerm.label} to restore prerequisite order.`,
					simulation.plannerState,
					`Push ${course.code} to the earliest valid later term.`,
					simulation.selectedOpportunityId,
				);

				if (
					!bestOption ||
					nextGraduationIndex < bestOption.nextGraduationIndex ||
					(nextGraduationIndex === bestOption.nextGraduationIndex &&
						targetTermIndex < bestOption.targetTermIndex) ||
					(nextGraduationIndex === bestOption.nextGraduationIndex &&
						targetTermIndex === bestOption.targetTermIndex &&
						simulation.assessment.issueCount < bestOption.issueCount)
				) {
					bestOption = {
						issueCount: simulation.assessment.issueCount,
						nextGraduationIndex,
						targetTermIndex,
						option,
					};
				}
			}
		}

		return bestOption
			? {
					kind: "fix" as const,
					label: "Fix",
					option: bestOption.option,
			  }
			: null;
	}

	function buildLoadReliefAction(
		insight: PlanInsight,
		sourceSnapshot: PlannerSnapshot,
		sourceAssessment: typeof planAssessment,
	) {
		if (!insight.linkedTermId || !sourceAssessment) return null;

		const sourceTerm = getSnapshotTerm(sourceSnapshot, insight.linkedTermId);
		if (!sourceTerm) return null;

		const currentGraduationTermId =
			getProjectedGraduationTermId(sourceSnapshot);
		const currentGraduationIndex = currentGraduationTermId
			? getTermIndex(currentGraduationTermId)
			: -1;
		const currentPrereqIssueCount = getPrerequisiteIssueCount(
			sourceAssessment.insights,
		);

		let bestOption:
			| {
					issueCount: number;
					nextGraduationIndex: number;
					targetTermIndex: number;
					option: InsightActionOption;
			  }
			| null = null;

		for (const course of [...sourceTerm.courses]
			.filter((scheduledCourse) => scheduledCourse.status === "planned")
			.sort((left, right) => right.order - left.order)) {
			for (const targetTerm of ACADEMIC_TERMS) {
				const targetTermIndex = getTermIndex(targetTerm.id);
				if (
					targetTermIndex <= getTermIndex(sourceTerm.term.id) ||
					!isFutureTerm(targetTerm.id) ||
					!course.allowedTerms.includes(getTermPattern(targetTerm.kind))
				) {
					continue;
				}

				const simulation = simulatePlannerState(
					buildPinnedCourseState(
						workingPlannerState,
						course.id,
						targetTerm.id,
					),
				);
				if (!simulation) continue;

				const nextSourceTerm = getSnapshotTerm(
					simulation.snapshot,
					sourceTerm.term.id,
				);
				const nextTargetTerm = getSnapshotTerm(
					simulation.snapshot,
					targetTerm.id,
				);
				const nextGraduationTermId = getProjectedGraduationTermId(
					simulation.snapshot,
				);
				const nextGraduationIndex = nextGraduationTermId
					? getTermIndex(nextGraduationTermId)
					: currentGraduationIndex;

				if (
					!nextSourceTerm ||
					!nextTargetTerm ||
					simulation.assessment.insights.some(
						(nextInsight) => nextInsight.id === insight.id,
					) ||
					nextTargetTerm.overload ||
					getPrerequisiteIssueCount(simulation.assessment.insights) >
						currentPrereqIssueCount
				) {
					continue;
				}

				const option = buildInsightActionOption(
					`load-${course.id}-${targetTerm.id}`,
					`Move ${course.code} to ${targetTerm.label}`,
					`Moved ${course.code} to ${targetTerm.label} to rebalance ${sourceTerm.term.label}.`,
					simulation.plannerState,
					`Relieve pressure in ${sourceTerm.term.label} by moving one course later.`,
					simulation.selectedOpportunityId,
				);

				if (
					!bestOption ||
					nextGraduationIndex < bestOption.nextGraduationIndex ||
					(nextGraduationIndex === bestOption.nextGraduationIndex &&
						targetTermIndex < bestOption.targetTermIndex) ||
					(nextGraduationIndex === bestOption.nextGraduationIndex &&
						targetTermIndex === bestOption.targetTermIndex &&
						simulation.assessment.issueCount < bestOption.issueCount)
				) {
					bestOption = {
						issueCount: simulation.assessment.issueCount,
						nextGraduationIndex,
						targetTermIndex,
						option,
					};
				}
			}
		}

		return bestOption
			? {
					kind: "fix" as const,
					label: "Fix",
					option: bestOption.option,
			  }
			: null;
	}

	function buildUnderloadInsightAction(
		insight: PlanInsight,
		sourceSnapshot: PlannerSnapshot,
		sourceAssessment: typeof planAssessment,
	) {
		if (!insight.linkedTermId || !sourceAssessment) return null;

		const targetTerm = getSnapshotTerm(sourceSnapshot, insight.linkedTermId);
		const targetAcademicTerm =
			ACADEMIC_TERMS[getTermIndex(insight.linkedTermId)] ?? null;
		if (!targetTerm || !targetAcademicTerm) return null;

		const currentGraduationTermId =
			getProjectedGraduationTermId(sourceSnapshot);
		const currentGraduationIndex = currentGraduationTermId
			? getTermIndex(currentGraduationTermId)
			: -1;
		const currentPrereqIssueCount = getPrerequisiteIssueCount(
			sourceAssessment.insights,
		);

		const options: Array<{
			issueCount: number;
			nextGraduationIndex: number;
			option: InsightActionOption;
		}> = [];

		for (const { course, termId: currentTermId } of getPlannedCoursePlacements(
			sourceSnapshot,
		)) {
			if (
				getTermIndex(currentTermId) <= getTermIndex(targetTerm.term.id) ||
				!course.allowedTerms.includes(
					getTermPattern(targetAcademicTerm.kind),
				)
			) {
				continue;
			}

			const simulation = simulatePlannerState(
				buildPinnedCourseState(
					workingPlannerState,
					course.id,
					targetTerm.term.id,
				),
			);
			if (!simulation) continue;

			const nextTargetTerm = getSnapshotTerm(
				simulation.snapshot,
				targetTerm.term.id,
			);
			const nextGraduationTermId = getProjectedGraduationTermId(
				simulation.snapshot,
			);
			const nextGraduationIndex = nextGraduationTermId
				? getTermIndex(nextGraduationTermId)
				: currentGraduationIndex;

			if (
				!nextTargetTerm ||
				nextTargetTerm.overload ||
				simulation.assessment.insights.some(
					(nextInsight) => nextInsight.id === insight.id,
				) ||
				getPrerequisiteIssueCount(simulation.assessment.insights) >
					currentPrereqIssueCount
			) {
				continue;
			}

			options.push({
				issueCount: simulation.assessment.issueCount,
				nextGraduationIndex,
				option: buildInsightActionOption(
					`underload-${course.id}-${targetTerm.term.id}`,
					`Move ${course.code} into ${targetAcademicTerm.label}`,
					`Moved ${course.code} into ${targetAcademicTerm.label}.`,
					simulation.plannerState,
					`Fill ${targetAcademicTerm.label} with another planned course.`,
					simulation.selectedOpportunityId,
				),
			});
		}

		if (options.length === 0) return null;

		return {
			kind: "options" as const,
			label: "Options",
			options: options
				.sort((left, right) => {
					if (left.nextGraduationIndex !== right.nextGraduationIndex) {
						return left.nextGraduationIndex - right.nextGraduationIndex;
					}

					if (left.issueCount !== right.issueCount) {
						return left.issueCount - right.issueCount;
					}

					return left.option.label.localeCompare(right.option.label);
				})
				.slice(0, 3)
				.map((entry) => entry.option),
		};
	}

	function getInsightAction(insight: PlanInsight): InsightUiAction | null {
		if (!snapshot || !planAssessment) return null;

		if (insight.id === "timeline-shift") {
			const options = buildTimelineTargetTermIds(snapshot)
				.map((termId) =>
					buildTimelineOption(termId, snapshot, planAssessment),
				)
				.filter(Boolean) as InsightActionOption[];

			return options.length > 0
				? {
						kind: "options",
						label: "Options",
						options,
				  }
				: null;
		}

		if (insight.id === "engw-online-option") {
			return buildWritingInsightAction(snapshot);
		}

		if (insight.id.startsWith("prereq-")) {
			return buildPrereqInsightAction(
				insight,
				snapshot,
				planAssessment,
			);
		}

		if (
			insight.id.startsWith("overload-") ||
			insight.id.startsWith("internship-load-")
		) {
			return buildLoadReliefAction(
				insight,
				snapshot,
				planAssessment,
			);
		}

		if (insight.id.startsWith("underload-")) {
			return buildUnderloadInsightAction(
				insight,
				snapshot,
				planAssessment,
			);
		}

		return null;
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

	function beginProcessingExit() {
		setProcessingIsExiting(true);

		if (processingExitTimeoutRef.current) {
			window.clearTimeout(processingExitTimeoutRef.current);
		}

		processingExitTimeoutRef.current = window.setTimeout(() => {
			setProcessingState(null);
			setProcessingIsExiting(false);
			processingExitTimeoutRef.current = null;
		}, 240);
	}

	function showLockedTermPopup() {
		setLockedTermPopup("Current semester locked");

		if (lockedTermPopupTimeoutRef.current) {
			window.clearTimeout(lockedTermPopupTimeoutRef.current);
		}

		lockedTermPopupTimeoutRef.current = window.setTimeout(() => {
			setLockedTermPopup(null);
			lockedTermPopupTimeoutRef.current = null;
		}, 1800);
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
			const spanTermIds = getDefaultBlockSpan(
				termId,
				blockType,
				canInteractWithTerm,
			);

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
		setExpandedInsightId(null);
		setUndoPlannerAction(null);
		setScenarioReturnState(null);
		setPlannerState(clonePlannerState(savedPlannerState));
		setSelectedOpportunityId(null);
		setActiveScenarioId(null);
		setDraftFingerprint(serializePlannerState(savedPlannerState));
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
		if (!snapshot || !planAssessment || !isDirty) return;

		const scenarioTitle =
			saveScenarioModal.value.trim() || saveScenarioModal.defaultTitle;

		const nextScenario: SavedScenario = {
			id: createScenarioId(),
			issueCount: planAssessment.issueCount,
			opportunityId: selectedOpportunityId,
			plannerState: clonePlannerState(plannerState),
			projectedGraduation: snapshot.projectedGraduation,
			title: scenarioTitle,
			topIssues: planAssessment.topIssueTexts.slice(0, 2),
			updatedAt: new Date().toISOString(),
		};

		setSavedScenarios((current) =>
			[nextScenario, ...current].sort(
				(left, right) =>
					new Date(right.updatedAt).getTime() -
					new Date(left.updatedAt).getTime(),
			),
		);
		setSaveScenarioModal((current) => ({ ...current, isOpen: false }));
		setActiveScenarioId(null);
		setScenarioReturnState(null);
		setDraftFingerprint(currentFingerprint);
	}

	function loadSavedScenario(scenarioId: string) {
		const scenario = savedScenarios.find(
			(entry) => entry.id === scenarioId,
		);
		if (!scenario) return;

		if (!scenarioReturnState) {
			setScenarioReturnState({
				activeScenarioId,
				browseOpportunityId,
				draftFingerprint,
				experimentMode,
				plannerState: clonePlannerState(plannerState),
				selectedOpportunityId,
			});
		}

		setBlockContextMenu(null);
		setSaveScenarioModal((current) => ({ ...current, isOpen: false }));
		setExpandedInsightId(null);
		setUndoPlannerAction(null);
		setPlannerState(clonePlannerState(scenario.plannerState));
		setSelectedOpportunityId(scenario.opportunityId);
		setBrowseOpportunityId(scenario.opportunityId);
		setActiveScenarioId(scenario.id);
		setDraftFingerprint(serializePlannerState(scenario.plannerState));
		setExperimentMode(true);
		setActiveView("plan");
	}

	function exitLoadedScenario() {
		if (!scenarioReturnState) {
			setActiveScenarioId(null);
			setExpandedInsightId(null);
			setUndoPlannerAction(null);
			setExperimentMode(false);
			setPlannerState(clonePlannerState(savedPlannerState));
			setSelectedOpportunityId(null);
			setBrowseOpportunityId(null);
			setDraftFingerprint(serializePlannerState(savedPlannerState));
			return;
		}

		setBlockContextMenu(null);
		setSaveScenarioModal((current) => ({ ...current, isOpen: false }));
		setExpandedInsightId(null);
		setUndoPlannerAction(null);
		setPlannerState(clonePlannerState(scenarioReturnState.plannerState));
		setSelectedOpportunityId(scenarioReturnState.selectedOpportunityId);
		setBrowseOpportunityId(scenarioReturnState.browseOpportunityId);
		setActiveScenarioId(scenarioReturnState.activeScenarioId);
		setDraftFingerprint(scenarioReturnState.draftFingerprint);
		setExperimentMode(scenarioReturnState.experimentMode);
		setScenarioReturnState(null);
	}

	function deleteSavedScenario(scenarioId: string) {
		const deletingActive = scenarioId === activeScenarioId;

		setSaveScenarioModal((current) => ({ ...current, isOpen: false }));
		setExpandedInsightId(null);
		setSavedScenarios((current) =>
			current.filter((scenario) => scenario.id !== scenarioId),
		);

		if (deletingActive) {
			setPlannerState(clonePlannerState(savedPlannerState));
			setSelectedOpportunityId(null);
			setActiveScenarioId(null);
			setDraftFingerprint(serializePlannerState(savedPlannerState));
			setScenarioReturnState(null);
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
			opportunity.blockType ?? "work-term",
			`${
				opportunity.blockType === "internship" ? "Internship" : "Co-op"
			}: ${opportunity.company}`,
		);

		setPlannerState(nextState);
		setSelectedOpportunityId(opportunity.id);
		setBrowseOpportunityId(opportunity.id);
		setActiveScenarioId(null);
		setExperimentMode(true);
		setActiveView("plan");
	}

	async function importJobFromUrl() {
		if (!profile || !savedSnapshot) return;

		const trimmedUrl = importedJobForm.url.trim();
		if (!trimmedUrl) {
			setImportedJobForm((current) => ({
				...current,
				message: "Paste a public job link first.",
				status: "error",
			}));
			return;
		}

		setImportedJobForm((current) => ({
			...current,
			message: "",
			status: "loading",
		}));

		try {
			const response = await fetch("/api/parse-job-url", {
				body: JSON.stringify({ url: trimmedUrl }),
				headers: {
					"Content-Type": "application/json",
				},
				method: "POST",
			});
			const payload = (await response.json()) as
				| ParseJobResponse
				| { error?: string };

			if (!response.ok || !("opportunity" in payload)) {
				throw new Error(
					payload && "error" in payload && payload.error
						? payload.error
						: "TermShift could not parse that job link yet.",
				);
			}

			const scoredOpportunity = scoreOpportunity(
				profile,
				payload.opportunity,
			);
			const preview = buildOpportunityPreviewForSearch(scoredOpportunity);

			if (!preview) {
				throw new Error(
					"TermShift could not model that role against your current plan.",
				);
			}

			setImportedOpportunityPreview(preview);
			setBrowseOpportunityId(preview.id);
			setImportedJobForm((current) => ({
				...current,
				message: "Imported listing ready to test in plan.",
				status: "idle",
			}));
		} catch (error) {
			setImportedJobForm((current) => ({
				...current,
				message:
					error instanceof Error
						? error.message
						: "TermShift could not parse that job link yet.",
				status: "error",
			}));
		}
	}

	function finalizeProfileLoad(
		nextProfile: StudentProfile,
		fileName: string,
		nextUploadedDocumentUrl: string | null,
		message: string,
	) {
		setProfile(nextProfile);
		replaceUploadedDocumentUrl(nextUploadedDocumentUrl);
		setPlannerState(clonePlannerState(DEFAULT_PLANNER_STATE));
		setSavedPlannerState(clonePlannerState(DEFAULT_PLANNER_STATE));
		setSavedScenarios([]);
		setActiveScenarioId(null);
		setDraftFingerprint(DEFAULT_PLANNER_FINGERPRINT);
		setScenarioReturnState(null);
		setExpandedInsightId(null);
		setSelectedOpportunityId(null);
		setBrowseOpportunityId(null);
		setUndoPlannerAction(null);
		setImportedOpportunityPreview(null);
		setImportedJobForm({
			message: "",
			status: "idle",
			url: "",
		});
		setExperimentMode(false);
		setSaveScenarioModal({
			defaultTitle: "",
			isOpen: false,
			value: "",
		});
		setPendingUpload(null);
		setUploadState({
			message,
			selectedFileName: fileName,
			status: "ready",
		});
		setActiveView("plan");
		beginProcessingExit();
	}

	async function startInitialProcessing(sampleAuditKey?: SampleAuditKey) {
		const sampleAudit = sampleAuditKey
			? SAMPLE_AUDITS[sampleAuditKey]
			: null;

		if (sampleAudit && !sampleAudit.seedProfileKey) {
			window.open(sampleAudit.url, "_blank", "noopener,noreferrer");
			return;
		}

		const nextIdentity: IdentityState = sampleAudit
			? {
					fullName:
						identity.fullName.trim() || sampleAudit.defaultFullName,
					major: sampleAudit.major,
					school: sampleAudit.school,
			  }
			: identity;
		const fileName = sampleAudit?.documentName ?? pendingUpload?.name;

		if (
			!nextIdentity.fullName.trim() ||
			!nextIdentity.school ||
			!nextIdentity.major ||
			!fileName
		) {
			return;
		}

		const runId = processingRunRef.current + 1;
		processingRunRef.current = runId;
		setProcessingIsExiting(false);

		if (processingExitTimeoutRef.current) {
			window.clearTimeout(processingExitTimeoutRef.current);
			processingExitTimeoutRef.current = null;
		}

		setIdentity(nextIdentity);
		setDemoMaterialsOpen(false);
		setUploadState({
			message: sampleAudit
				? "Opening the example degree audit."
				: "Preparing your degree audit.",
			selectedFileName: fileName,
			status: "processing",
		});

		let documentUrl: string | null = sampleAudit?.url ?? null;

		if (!documentUrl && pendingUpload) {
			try {
				documentUrl = await readFileAsDataUrl(pendingUpload);
			} catch {
				documentUrl = null;
			}
		}

		if (!documentUrl) return;

		setProcessingState({
			documentName: fileName,
			documentUrl,
			phase: "loading",
		});

		const loadProfilePromise = (async () => {
			try {
				let extractedText = "";

				if (!sampleAudit && pendingUpload) {
					try {
						extractedText = await extractUploadText(pendingUpload);
					} catch {
						extractedText = "";
					}
				}

				const baseProfile = sampleAudit
					? buildDemoProfile(fileName, sampleAudit.seedProfileKey)
					: buildProfileFromUpload(fileName, extractedText);
				const nextProfile = applyIdentityToProfile(
					baseProfile,
					nextIdentity,
				);

				return {
					message: nextProfile.parserNote,
					nextProfile,
				};
			} catch {
				const fallbackProfile = applyIdentityToProfile(
					buildDemoProfile(
						fileName,
						sampleAudit?.seedProfileKey ?? "sophomore",
					),
					nextIdentity,
				);

				return {
					message: sampleAudit
						? fallbackProfile.parserNote
						: "Upload received. TermShift opened the seeded Northeastern BSCS demo model for this file.",
					nextProfile: fallbackProfile,
				};
			}
		})();

		await delay(650);

		if (processingRunRef.current !== runId) {
			if (documentUrl.startsWith("blob:")) {
				URL.revokeObjectURL(documentUrl);
			}
			return;
		}

		setProcessingState((current) =>
			current
				? {
						...current,
						phase: "scanning",
				  }
				: current,
		);

		const result = await loadProfilePromise;

		await delay(3400);

		if (processingRunRef.current !== runId) {
			if (documentUrl.startsWith("blob:")) {
				URL.revokeObjectURL(documentUrl);
			}
			return;
		}

		finalizeProfileLoad(
			result.nextProfile,
			fileName,
			documentUrl,
			result.message,
		);
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
			let extractedText = "";

			if (!useSeededDemo && pendingUpload) {
				try {
					extractedText = await extractUploadText(pendingUpload);
				} catch {
					extractedText = "";
				}
			}

			const baseProfile =
				useSeededDemo || !pendingUpload
					? buildDemoProfile(fileName)
					: buildProfileFromUpload(fileName, extractedText);
			const nextProfile = applyIdentityToProfile(baseProfile, identity);
			const nextUploadedDocumentUrl =
				useSeededDemo || !pendingUpload
					? null
					: await readFileAsDataUrl(pendingUpload);

			finalizeProfileLoad(
				nextProfile,
				fileName,
				nextUploadedDocumentUrl,
				nextProfile.parserNote,
			);
		} catch {
			const fallbackProfile = applyIdentityToProfile(
				buildDemoProfile(fileName),
				identity,
			);

			finalizeProfileLoad(
				fallbackProfile,
				fileName,
				null,
				"Upload received. TermShift opened the seeded Northeastern BSCS demo model for this file.",
			);
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

	function resetToLanding() {
		processingRunRef.current += 1;
		window.localStorage.removeItem(APP_STORAGE_KEY);
		setExpandedInsightId(null);
		setScenarioReturnState(null);
		setUndoPlannerAction(null);
		replaceUploadedDocumentUrl(null);

		if (processingExitTimeoutRef.current) {
			window.clearTimeout(processingExitTimeoutRef.current);
			processingExitTimeoutRef.current = null;
		}

		if (lockedTermPopupTimeoutRef.current) {
			window.clearTimeout(lockedTermPopupTimeoutRef.current);
			lockedTermPopupTimeoutRef.current = null;
		}

		if (processingState?.documentUrl.startsWith("blob:")) {
			URL.revokeObjectURL(processingState.documentUrl);
		}

		setProfile(null);
		setIdentity(createDefaultIdentity());
		setPlannerState(clonePlannerState(DEFAULT_PLANNER_STATE));
		setSavedPlannerState(clonePlannerState(DEFAULT_PLANNER_STATE));
		setSavedScenarios([]);
		setActiveScenarioId(null);
		setSelectedOpportunityId(null);
		setBrowseOpportunityId(null);
		setImportedOpportunityPreview(null);
		setImportedJobForm({
			message: "",
			status: "idle",
			url: "",
		});
		setExperimentMode(false);
		setSidebarCollapsed(false);
		setPendingUpload(null);
		setProcessingState(null);
		setProcessingIsExiting(false);
		setLockedTermPopup(null);
		setDemoMaterialsOpen(false);
		setBlockContextMenu(null);
		setHighlightedProfileSection(null);
		setSaveScenarioModal({
			defaultTitle: "",
			isOpen: false,
			value: "",
		});
		setUploadState({
			message: "",
			selectedFileName: "",
			status: "idle",
		});
		setActiveView("profile");
	}

	function renderScreenTitle(title: string) {
		return (
			<div className="screen-title-row">
				<TermShiftLogo className="termshift-logo--screen-title" />
				<h1 className="screen-title">{title}</h1>
			</div>
		);
	}

	function toggleRailSection(section: RailSectionKey) {
		setCollapsedRailSections((current) => ({
			...current,
			[section]: !current[section],
		}));
	}

	function buildOpportunityPreviewForSearch(
		opportunity: OpportunitySuggestion,
	) {
		if (!profile || !savedSnapshot) return null;

		const scenarioTerms = getTermIdsBetween(
			opportunity.termStartId,
			opportunity.termEndId,
		);
		const blockLabel =
			opportunity.blockType === "internship"
				? `Internship: ${opportunity.company}`
				: `Co-op: ${opportunity.company}`;
		const scenarioState = buildScenarioState(
			clonePlannerState(savedPlannerState),
			scenarioTerms,
			opportunity.blockType ?? "work-term",
			blockLabel,
		);
		const scenarioSnapshot = derivePlannerSnapshot(profile, scenarioState);
		const scenarioAssessment = buildPlanAssessment({
			baselineSnapshot: savedSnapshot,
			experimentMode: true,
			profile,
			selectedOpportunity: opportunity,
			snapshot: scenarioSnapshot,
		});

		return {
			...opportunity,
			issueCount: scenarioAssessment.issueCount,
			projectedGraduation: scenarioSnapshot.projectedGraduation,
			topIssues: scenarioAssessment.topIssueTexts,
		};
	}

	function highlightAndScrollInsight(insightId: string) {
		setHighlightedInsightId(insightId);
		insightItemRefs.current
			.get(insightId)
			?.scrollIntoView({ behavior: "smooth", block: "nearest" });
	}

	function renderTermIssueDots(termId: string) {
		const linkedIssues = termIssueMap.get(termId) ?? [];

		if (linkedIssues.length === 0) return null;

		return (
			<div className="term-issue-row">
				{linkedIssues.map((issue) => (
					<button
						key={issue.id}
						type="button"
						aria-label={issue.title}
						className={`term-issue-dot ${getIssueToneClass(
							issue.tone,
						)} ${
							highlightedInsightId === issue.id
								? "is-highlighted"
								: ""
						}`}
						onMouseEnter={() => highlightAndScrollInsight(issue.id)}
						onMouseLeave={() => setHighlightedInsightId(null)}
						onFocus={() => highlightAndScrollInsight(issue.id)}
						onBlur={() => setHighlightedInsightId(null)}
						title={`${issue.title}: ${issue.description}`}
					/>
				))}
			</div>
		);
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
		const previousTermId = isStart
			? null
			: ACADEMIC_TERMS[getTermIndex(termId) - 1]?.id ?? null;
		const nextTermId = isEnd
			? null
			: ACADEMIC_TERMS[getTermIndex(termId) + 1]?.id ?? null;
		const extendsFromVisibleLeft = previousTermId
			? areTermsVisuallyAdjacent(previousTermId, termId)
			: false;
		const extendsToVisibleRight = nextTermId
			? areTermsVisuallyAdjacent(termId, nextTermId)
			: false;
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
				} ${
					extendsFromVisibleLeft ? "is-continued-left" : ""
				} ${
					extendsToVisibleRight ? "is-continued-right" : ""
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

	function renderProcessingScreen() {
		if (!processingState) return null;

		if (processingState.phase === "loading") {
			return (
				<section className="processing-screen processing-screen--loading">
					<div className="processing-loader">
						<div
							className="processing-loader-mark"
							aria-hidden="true"
						>
							<span />
							<span />
							<span />
						</div>
						<h1 className="screen-title">Preparing your plan.</h1>
						<p className="screen-intro">
							TermShift is opening your degree audit and building
							the baseline academic path.
						</p>
					</div>
				</section>
			);
		}

		return (
			<section className="processing-screen">
				<header className="processing-header">
					<h1 className="screen-title">
						Scanning your degree audit.
					</h1>
					<p className="screen-intro">
						TermShift is reading completed coursework, mapping
						in-progress terms, and preparing your path plan.
					</p>
				</header>

				<div className="processing-layout">
					<div className="processing-document-shell">
						<div className="processing-document-topline">
							<span className="profile-label">Degree Audit</span>
							<span className="processing-document-name">
								{processingState.documentName}
							</span>
						</div>
						<div className="processing-document-frame-wrap">
							<iframe
								title={processingState.documentName}
								src={processingState.documentUrl}
								className="processing-document-frame"
							/>
							<div
								className="processing-scan-overlay"
								aria-hidden="true"
							>
								<div className="processing-scan-line" />
								<div className="processing-scan-grid" />
							</div>
						</div>
					</div>

					<aside className="processing-panel">
						<p className="profile-label">Profile</p>
						<p className="processing-panel-value">
							{identity.fullName || "Demo Student"}
						</p>
						<p className="processing-panel-meta">
							{identity.school || "Northeastern University"}
						</p>
						<p className="processing-panel-meta">
							{identity.major
								? PROGRAM_LABELS[
										identity.major as Exclude<
											MajorOption,
											""
										>
								  ]
								: "BS CS · Software concentration"}
						</p>

						<div className="processing-steps">
							<div className="processing-step is-complete">
								<span className="processing-step-dot" />
								<span>Opening uploaded document</span>
							</div>
							<div className="processing-step is-active">
								<span className="processing-step-dot" />
								<span>Scanning courses and term history</span>
							</div>
							<div className="processing-step">
								<span className="processing-step-dot" />
								<span>Building baseline degree plan</span>
							</div>
						</div>
					</aside>
				</div>
			</section>
		);
	}

	function renderProfileScreen() {
		if (!profile) {
			return (
				<section className="landing-screen">
					<div className="landing-hero">
						<TermShiftLogo
							size={152}
							className="termshift-logo--landing"
						/>

						<div className="landing-hero-copy">
							<h1 className="screen-title">
								Graduate with more than a diploma.
							</h1>
						</div>
					</div>

					<div className="landing-copy">
						<p className="screen-intro">
							The best time to get your first real industry
							experience isn&apos;t after graduation; it&apos;s
							during college.
						</p>
						<p className="screen-intro">
							Universities across North America now support
							co-ops, internships, and semester-long work terms
							for academic credit. <br />
							But figuring out when you can take one, which jobs
							you&apos;re qualified for, and whether it will delay
							graduation is surprisingly difficult.
						</p>
						<p className="screen-intro">
							<strong>TermShift</strong> helps you discover
							opportunities that fit your academic plan, then
							models exactly how each one affects your degree
							timeline, so you can graduate with both a diploma
							and real experience.
						</p>
						{/* <p className="screen-intro">
							<strong>
								Get started today by uploading an unofficial
								transcript or degree audit.
							</strong>
						</p> */}
					</div>

					<div className="landing-setup">
						<p className="landing-setup-title">
							Get started today by uploading an unofficial
							transcript or degree audit
							<ArrowRightIcon className="landing-setup-title-icon" />
						</p>

						<div className="landing-setup-grid landing-setup-grid--intake">
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
									className="profile-input profile-input--select"
									onChange={(event) =>
										setIdentity((current) => ({
											...current,
											major:
												current.school ===
												event.target.value
													? current.major
													: "",
											school: event.target
												.value as SchoolOption,
										}))
									}
								>
									<option value="">Select school</option>
									{SCHOOL_OPTIONS.map((school) => (
										<option key={school} value={school}>
											{school}
										</option>
									))}
								</select>
							</label>

							<label className="form-field">
								<span className="profile-label">Major</span>
								<select
									value={identity.major}
									disabled={!identity.school}
									className="profile-input profile-input--select"
									onChange={(event) =>
										setIdentity((current) => ({
											...current,
											major: event.target
												.value as MajorOption,
										}))
									}
								>
									<option value="">
										{identity.school
											? "Select major"
											: "Select school first"}
									</option>
									{availableMajorOptions.map((major) => (
										<option key={major} value={major}>
											{MAJOR_LABELS[major]}
										</option>
									))}
								</select>
							</label>
						</div>

						<div
							className={`landing-next-step ${
								landingIntakeReady ? "is-visible" : ""
							}`}
							aria-hidden={!landingIntakeReady}
						>
							<div className="landing-upload-row">
								<label className="plan-action-button plan-action-button--primary upload-button">
									Upload degree audit
									<input
										type="file"
										accept=".pdf"
										className="upload-input"
										onChange={handleFileSelection}
									/>
								</label>
								<button
									type="button"
									disabled={
										!pendingUpload ||
										uploadState.status === "processing"
									}
									className="plan-action-button"
									onClick={() => startInitialProcessing()}
								>
									Continue
								</button>
							</div>

							<p className="upload-file-name landing-file-name">
								{pendingUpload?.name ?? ""}
							</p>

							<button
								type="button"
								className="landing-demo-trigger"
								onClick={() =>
									setDemoMaterialsOpen((current) => !current)
								}
							>
								<span
									aria-hidden="true"
									className="landing-demo-trigger-caret"
								>
									{demoMaterialsOpen ? "▾" : "▸"}
								</span>
								<span className="landing-demo-trigger-label">
									Test / Demo Materials
								</span>
							</button>

							{demoMaterialsOpen ? (
								<div className="landing-demo-box">
									{selectedSampleAudit ? (
										<>
											<p className="landing-demo-copy">
												{selectedSampleAudit.seedProfileKey
													? "Click the button below to test TermShift using the "
													: "Open the "}
												<a
													href={
														selectedSampleAudit.url
													}
													target="_blank"
													rel="noreferrer"
													className="profile-inline-link"
												>
													example degree audit
												</a>{" "}
												for{" "}
												<strong>
													{selectedSampleAudit.school}
													,{" "}
													{
														PROGRAM_LABELS[
															selectedSampleAudit
																.major
														]
													}
												</strong>
												.
											</p>
											{selectedSampleAudit.seedProfileKey ? (
												<div className="detail-actions">
													<button
														type="button"
														className="plan-action-button plan-action-button--primary"
														onClick={() =>
															startInitialProcessing(
																selectedSampleAuditKey ??
																	undefined,
															)
														}
													>
														Use example degree audit
													</button>
												</div>
											) : (
												<>
													<p className="landing-demo-copy">
														This sample is ready for
														upload testing now. Full
														degree-path modeling for
														Columbia is not seeded
														in this MVP yet.
													</p>
													<div className="detail-actions">
														<a
															href={
																selectedSampleAudit.url
															}
															target="_blank"
															rel="noreferrer"
															className="plan-action-button"
														>
															Open example degree
															audit
														</a>
													</div>
												</>
											)}
										</>
									) : (
										<p className="landing-demo-copy">
											Select your school and major to load
											the matching example degree audit.
										</p>
									)}
								</div>
							) : null}

							{uploadState.message ? (
								<p
									className={`inline-note inline-note--${uploadState.status}`}
								>
									{uploadState.message}
								</p>
							) : null}
						</div>
					</div>
				</section>
			);
		}

		return (
			<section className="pathwise-screen pathwise-screen--plan">
				<header className="screen-header">
					{renderScreenTitle("Profile")}
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
						<span className="profile-label">Program</span>
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
						<span className="profile-label">
							Transcript / Degree Audit
						</span>
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
								Replace Upload
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
			</section>
		);
	}

	function renderPathPlan() {
		if (!profile || !snapshot || !savedSnapshot) return null;

		return (
			<section className="pathwise-screen pathwise-screen--plan">
				<header className="screen-header">
					<div className="path-plan-topline">
						{renderScreenTitle("Degree Path")}

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
						<div className="path-plan-subline-copy">
							<p className="path-plan-subline-title">
								{isViewingSavedScenario
									? `Viewing Scenario: ${activeSavedScenario?.title}`
									: experimentMode
										? "Experimental Plan Mode"
										: "Viewing Current Plan"}
							</p>
							<p className="path-plan-subline-body">
								{isViewingSavedScenario ? (
									<>
										Loaded from Saved Scenarios.{" "}
										<button
											type="button"
											className="inline-link-button"
											onClick={exitLoadedScenario}
										>
											Exit scenario
										</button>{" "}
										to return to your previous state.
									</>
								) : experimentMode ? (
									<>
										Model how co-ops, internships, or time
										off would shift your course sequence and
										projected graduation. You can also test
										a role from{" "}
										<button
											type="button"
											className="inline-link-button"
											onClick={() =>
												navigateToView("search")
											}
										>
											Work Term Search
										</button>{" "}
										directly in this plan.
									</>
								) : (
									<>
										TermShift&apos;s current best-fit degree
										path, based on your{" "}
										<button
											type="button"
											className="inline-link-button"
											onClick={
												highlightProfileUploadSection
											}
										>
											uploaded degree audit
										</button>{" "}
										and Northeastern&apos;s{" "}
										<a
											href={REQUIREMENTS_URL}
											target="_blank"
											rel="noreferrer"
											className="inline-link-button"
										>
											{requirementsLinkLabel}
										</a>
										.
									</>
								)}
							</p>
						</div>

						<div className="path-plan-header-summary">
							<div className="summary-pill">
								<span className="summary-pill-label">
									Credits
								</span>
								<span className="summary-pill-copy">
									<strong className="summary-pill-value">
										{savedSnapshot.satisfiedCredits}/
										{TOTAL_DEGREE_CREDITS}
									</strong>
									<span className="summary-pill-meta">
										complete
									</span>
									<span
										className="summary-pill-dot"
										aria-hidden="true"
									>
										·
									</span>
									<strong className="summary-pill-value">
										{savedSnapshot.inProgressCredits}
									</strong>
									<span className="summary-pill-meta">
										in progress
									</span>
								</span>
							</div>
							<div className="summary-pill">
								<span className="summary-pill-label">
									Projected Graduation
								</span>
								<span className="summary-pill-copy">
									<strong className="summary-pill-value">
										{snapshot?.projectedGraduation ??
											savedSnapshot.projectedGraduation}
									</strong>
								</span>
							</div>
						</div>
					</div>
				</header>

				<div className="path-plan-board">
					<div className="path-plan-main-column">
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
										const isCurrentTerm =
											termId ===
											profile?.lockedThroughTermId;
										const canDrop = termId
											? canInteractWithTerm(termId)
											: false;
										const isDropTarget =
											termId !== undefined &&
											draggingTermId === termId;
										const isLinkedIssueHighlighted =
											termId !== undefined
												? (
														termIssueMap.get(
															termId,
														) ?? []
												  ).some(
														(issue) =>
															issue.id ===
															highlightedInsightId,
												  )
												: false;

										return (
											<div
												key={`${row.key}-${kind}`}
												className={`path-plan-term ${
													canDrop
														? "is-future"
														: "is-past"
												} ${
													isCurrentTerm
														? "is-current-term"
														: ""
												} ${
													isDropTarget
														? "is-drop-target"
														: ""
												} ${
													isLinkedIssueHighlighted
														? "is-linked-issue"
														: ""
												}`}
												onDragOver={(event) => {
													if (!termId)
														return;
													if (
														isCurrentTerm &&
														experimentMode
													) {
														event.preventDefault();
														event.dataTransfer.dropEffect =
															"none";
														return;
													}
													if (!canDrop)
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
													if (
														isCurrentTerm &&
														experimentMode
													) {
														event.preventDefault();
														setDraggingTermId(null);
														showLockedTermPopup();
														return;
													}
													handleTermDrop(
														termId,
														event,
													);
												}}
											>
												{termId
													? renderTermIssueDots(
															termId,
													  )
													: null}
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

						<section className="saved-scenarios-section rail-section rail-section--divided">
							<button
								type="button"
								className="rail-section-toggle"
								onClick={() => toggleRailSection("savedScenarios")}
								aria-expanded={!collapsedRailSections.savedScenarios}
							>
								<span className="block-label">
									Saved Scenarios ({savedScenarios.length})
								</span>
								<span className="rail-section-caret" aria-hidden="true">
									{collapsedRailSections.savedScenarios ? "+" : "−"}
								</span>
							</button>
							{collapsedRailSections.savedScenarios ? null : savedScenarios.length >
							  0 ? (
								<div
									className="saved-scenarios-carousel"
									role="region"
									aria-label="Saved scenarios"
								>
									{savedScenarios.map((scenario) => (
										<article
											key={scenario.id}
											className={`saved-scenario-card ${
												activeScenarioId === scenario.id
													? "is-active"
													: ""
											}`}
										>
											<button
												type="button"
												className="saved-scenario-card-select"
												onClick={() => loadSavedScenario(scenario.id)}
											>
												<strong className="saved-scenario-title">
													{scenario.title}
												</strong>
												<span className="saved-scenario-meta">
													Projected grad {scenario.projectedGraduation}
												</span>
												<span className="saved-scenario-meta">
													{scenario.issueCount}{" "}
													{scenario.issueCount === 1 ? "issue" : "issues"}
												</span>
											</button>
											<button
												type="button"
												aria-label={`Delete ${scenario.title}`}
												className="saved-scenario-delete"
												onClick={() => deleteSavedScenario(scenario.id)}
											>
												Delete
											</button>
										</article>
									))}
								</div>
							) : (
								<p className="rail-copy">
									Saved what-if paths will appear here.
								</p>
							)}
						</section>
					</div>

					<aside className="path-plan-blocks">
						<div className="rail-section">
							<button
								type="button"
								className="rail-section-toggle"
								onClick={() => toggleRailSection("blocks")}
								aria-expanded={!collapsedRailSections.blocks}
							>
								<span className="block-label">Blocks</span>
								<span
									className="rail-section-caret"
									aria-hidden="true"
								>
									{collapsedRailSections.blocks ? "+" : "−"}
								</span>
							</button>
							{collapsedRailSections.blocks ? null : (
								<>
									<div className="block-list">
										{renderPaletteBlock("work-term")}
										{renderPaletteBlock("internship")}
										{renderPaletteBlock("time-off")}
									</div>
									{experimentMode ? null : (
										<p className="rail-copy">
											Switch to Experiment above to place
											these blocks into future terms.
										</p>
									)}
								</>
							)}
						</div>

						<div className="rail-section rail-section--divided rail-section--insights">
							<button
								type="button"
								className="rail-section-toggle"
								onClick={() => toggleRailSection("insights")}
								aria-expanded={!collapsedRailSections.insights}
							>
								<span className="block-label">
									Plan Insights
								</span>
								<span
									className="rail-section-caret"
									aria-hidden="true"
								>
									{collapsedRailSections.insights ? "+" : "−"}
								</span>
							</button>
							{planAssessment ? (
								<div
									className={`insight-scroll ${
										experimentMode && isDirty
											? "has-floating-actions"
											: ""
									} ${
										collapsedRailSections.insights
											? "is-collapsed"
											: ""
									}`}
								>
									<ul className="insight-list">
										{planAssessment.insights.map(
											(insight) => {
												const insightAction =
													getInsightAction(insight);
												const isExpanded =
													expandedInsightId ===
													insight.id;

												return (
													<li
														key={insight.id}
														ref={(node) => {
															insightItemRefs.current.set(
																insight.id,
																node,
															);
														}}
														className={`insight-item ${getIssueToneClass(
															insight.tone,
														)} ${
															highlightedInsightId ===
															insight.id
																? "is-highlighted"
																: ""
														}`}
														onMouseEnter={() =>
															setHighlightedInsightId(
																insight.id,
															)
														}
														onMouseLeave={() =>
															setHighlightedInsightId(
																null,
															)
														}
													>
														<span className="insight-dot" />
														<div className="insight-body">
															<div className="insight-main-row">
																<p className="insight-line">
																	<strong className="insight-title">
																		{
																			insight.title
																		}
																	</strong>{" "}
																	<span className="insight-description">
																		{
																			insight.description
																		}
																	</span>
																</p>
																{insightAction ? (
																	<button
																		type="button"
																		className="insight-action-button"
																		onClick={() =>
																			insightAction.kind ===
																			"fix"
																				? applyInsightOption(
																						insightAction.option,
																				  )
																				: setExpandedInsightId(
																						isExpanded
																							? null
																							: insight.id,
																				  )
																		}
																		aria-expanded={
																			insightAction.kind ===
																			"options"
																				? isExpanded
																				: undefined
																		}
																		aria-label={
																			insightAction.kind ===
																			"fix"
																				? "Apply suggested fix"
																				: isExpanded
																					? "Hide suggested options"
																					: "Show suggested options"
																		}
																		title={
																			insightAction.kind ===
																			"fix"
																				? "Apply suggested fix"
																				: isExpanded
																					? "Hide suggested options"
																					: "Show suggested options"
																		}
																	>
																		<span aria-hidden="true">
																			✨
																		</span>
																	</button>
																) : null}
															</div>
															{insightAction &&
															insightAction.kind ===
																"options" &&
															isExpanded ? (
																<div className="insight-action-panel">
																	{insightAction.options.map(
																		(option) => (
																			<button
																				key={
																					option.id
																				}
																				type="button"
																				className="insight-option-button"
																				onClick={() =>
																					applyInsightOption(
																						option,
																					)
																				}
																			>
																				<span className="insight-option-label">
																					{
																						option.label
																					}
																				</span>
																				{option.description ? (
																					<span className="insight-option-description">
																						{
																							option.description
																						}
																					</span>
																				) : null}
																			</button>
																		),
																	)}
																</div>
															) : null}
														</div>
													</li>
												);
											},
										)}
									</ul>
								</div>
							) : (
								<p
									className={`rail-copy ${
										collapsedRailSections.insights
											? "is-collapsed"
											: ""
									}`}
								>
									TermShift is still building this path
									assessment.
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
							Save Scenario
						</button>
					</div>
				) : null}

				{undoPlannerAction ? (
					<div
						className={`planner-undo-toast ${
							undoPlannerActionIsClosing ? "is-closing" : ""
						}`}
					>
						<p className="planner-undo-copy">
							{undoPlannerAction.message}
						</p>
						<button
							type="button"
							className="plan-action-button"
							onClick={undoLastInsightAction}
						>
							Undo
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

				{lockedTermPopup ? (
					<div className="locked-term-popup" role="status" aria-live="polite">
						{lockedTermPopup}
					</div>
				) : null}
			</section>
		);
	}

	function renderSearch() {
		if (!profile || !savedSnapshot) return null;

		return (
			<section className="pathwise-screen pathwise-screen--search">
				<header className="screen-header search-screen-header">
					<div className="search-screen-header-copy">
						{renderScreenTitle("Work Term Search")}
						<p className="screen-intro">
							TermShift ranks work terms using the courses already
							on your transcript, then lets you test a listing
							directly in the planner before you commit to that
							scenario.
						</p>
					</div>
					<div className="search-header-actions">
						<div className="search-import-panel search-import-panel--header">
							<p className="block-label">Try Any Role</p>
							<form
								className="search-import-form"
								onSubmit={(event) => {
									event.preventDefault();
									void importJobFromUrl();
								}}
							>
								<input
									type="url"
									value={importedJobForm.url}
									placeholder="Paste a LinkedIn or Indeed job URL"
									className="profile-input search-import-input"
									onChange={(event) =>
										setImportedJobForm((current) => ({
											...current,
											message: "",
											status: "idle",
											url: event.target.value,
										}))
									}
								/>
								<button
									type="submit"
									disabled={importedJobForm.status === "loading"}
									className="plan-action-button"
								>
									{importedJobForm.status === "loading"
										? "Importing..."
										: "Import URL"}
								</button>
							</form>
							{importedJobForm.message ? (
								<p
									className={`inline-note inline-note--${
										importedJobForm.status === "error"
											? "error"
											: "ready"
									}`}
								>
									{importedJobForm.message}
								</p>
							) : null}
						</div>
					</div>
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

					{importedJobForm.status === "loading" ? (
						<aside className="search-detail search-detail--loading">
							<div
								className="search-detail-loading-spinner"
								aria-hidden="true"
							/>
							<div className="search-detail-loading-copy">
								<p className="block-label">
									Importing Listing
								</p>
								<h2 className="search-detail-title">
									Parsing role details
								</h2>
								<p className="search-detail-copy">
									TermShift is pulling the job post,
									extracting the role details, and
									modeling it against your degree plan.
								</p>
							</div>
						</aside>
					) : activeSearchOpportunity ? (
						<aside className="search-detail">
							<p className="block-label">
								{activeSearchOpportunity.id.startsWith(
									"imported-",
								)
									? "Imported Listing"
									: "Selected Listing"}
							</p>
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
							{activeSearchOpportunity.sourceUrl ? (
								<a
									href={activeSearchOpportunity.sourceUrl}
									target="_blank"
									rel="noreferrer"
									className="profile-inline-link"
								>
									View source
								</a>
							) : null}

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
								{activeSearchOpportunity.issueCount > 0 ? (
									<ul className="signal-list">
										{activeSearchOpportunity.topIssues.map(
											(issue) => (
												<li
													key={issue}
													className="signal-item"
												>
													{issue}
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

	function renderProcessingOverlay() {
		if (!processingState) return null;

		return (
			<div
				className={`processing-overlay ${
					processingIsExiting ? "is-exiting" : ""
				}`}
				aria-live="polite"
			>
				<div
					className={`processing-overlay-panel processing-overlay-panel--${processingState.phase}`}
				>
					{renderProcessingScreen()}
				</div>
			</div>
		);
	}

	if (!profile) {
		return (
			<main className="landing-shell">
				<div className="landing-content">
					{renderProfileScreen()}
				</div>
				{renderProcessingOverlay()}
			</main>
		);
	}

	return (
		<main
			className="pathwise-shell"
			data-nav-collapsed={sidebarCollapsed ? "true" : "false"}
		>
			<aside className="pathwise-sidebar">
				<div className="pathwise-sidebar-content">
					<div className="pathwise-sidebar-header">
						<button
							type="button"
							className="pathwise-sidebar-toggle"
							aria-label={
								sidebarCollapsed
									? "Expand sidebar"
									: "Collapse sidebar"
							}
							onClick={() =>
								setSidebarCollapsed((current) => !current)
							}
						>
							{sidebarCollapsed ? "→" : "←"}
						</button>
					</div>

					{sidebarCollapsed ? null : (
						<nav className="pathwise-nav" aria-label="Primary">
							<button
								type="button"
								aria-current={
									activeView === "profile"
										? "page"
										: undefined
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

					<div className="pathwise-sidebar-footer">
						<button
							type="button"
							className="pathwise-sidebar-logout"
							aria-label="Log out and return to landing page"
							onClick={resetToLanding}
						>
							{sidebarCollapsed ? "⤺" : "Log out"}
						</button>
					</div>
				</div>
			</aside>

			<div className="pathwise-content">
				{sidebarCollapsed ? (
					<button
						type="button"
						className="pathwise-sidebar-reopen"
						aria-label="Show sidebar"
						onClick={() => setSidebarCollapsed(false)}
					>
						→
					</button>
				) : null}
				{activeView === "profile" ? renderProfileScreen() : null}
				{activeView === "plan" ? renderPathPlan() : null}
				{activeView === "search" ? renderSearch() : null}
			</div>
			{renderProcessingOverlay()}
		</main>
	);
}
