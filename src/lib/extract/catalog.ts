import {
	ACADEMIC_TERMS,
	COURSE_REQUIREMENTS,
} from "@/lib/pathwise-data";

export const COURSE_ID_SET = new Set(
	COURSE_REQUIREMENTS.map((course) => course.id),
);

export const TERM_ID_SET = new Set(ACADEMIC_TERMS.map((term) => term.id));

export function catalogPromptBlock() {
	return COURSE_REQUIREMENTS.map(
		(course) => `${course.id}: ${course.code} — ${course.title}`,
	).join("\n");
}

export function termPromptBlock() {
	return ACADEMIC_TERMS.map((term) => `${term.id} (${term.label})`).join(", ");
}

export function normalizeCourseCode(code: string) {
	return code.replace(/\s+/g, " ").trim().toUpperCase();
}

export function expandCatalogCodes(code: string) {
	const normalized = normalizeCourseCode(code);
	const variants = new Set<string>([
		normalized,
		normalized.replace(/\s+/g, ""),
	]);

	if (normalized.includes("/")) {
		const [left, right] = normalized.split("/");
		const prefixMatch = left.match(/^(.*\s)/);
		const prefix = prefixMatch ? prefixMatch[1] : "";
		const rightFull = `${prefix}${right.trim()}`.trim();
		for (const value of [left.trim(), rightFull]) {
			variants.add(value);
			variants.add(value.replace(/\s+/g, ""));
		}
	}

	return [...variants];
}

const CODE_TO_ID = (() => {
	const index = new Map<string, string>();

	for (const course of COURSE_REQUIREMENTS) {
		for (const variant of expandCatalogCodes(course.code)) {
			if (!index.has(variant)) index.set(variant, course.id);
		}
	}

	return index;
})();

export function mapCourseCodeToId(code: string) {
	const normalized = normalizeCourseCode(code);
	return (
		CODE_TO_ID.get(normalized) ??
		CODE_TO_ID.get(normalized.replace(/\s+/g, "")) ??
		null
	);
}

export function uniqueIds(ids: Array<string | null | undefined>) {
	return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}
