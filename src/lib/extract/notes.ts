import type { ExtractionFallbackReason, ExtractionSource } from "@/lib/extract/types";

function withFailureReason(base: string, failureDetail?: string) {
	if (!failureDetail) return base;
	return base.replace(
		"structured extraction failed",
		`structured extraction failed (${failureDetail})`,
	);
}

export function buildJobExtractionNote(
	source: ExtractionSource,
	fallbackReason: ExtractionFallbackReason,
	failureDetail?: string,
) {
	if (source === "llm") {
		return "Imported listing with structured extraction. Ready to test in plan.";
	}

	if (fallbackReason === "llm-error") {
		return withFailureReason(
			"Imported with the local parser after structured extraction failed. Review the listing before testing it in plan.",
			failureDetail,
		);
	}

	return "Imported with the local parser because no OpenAI API key is configured. Review the listing before testing it in plan.";
}

export function buildTranscriptExtractionNote(
	details: string,
	source: ExtractionSource,
	fallbackReason: ExtractionFallbackReason,
	failureDetail?: string,
) {
	if (source === "llm") {
		return `${details} Structured extraction filled this snapshot from the uploaded document.`;
	}

	if (fallbackReason === "llm-error") {
		const reason = failureDetail ? ` (${failureDetail})` : "";
		return `${details} Structured extraction failed${reason}, so TermShift used the local parser.`;
	}

	return `${details} No OpenAI API key is configured, so TermShift used the local parser.`;
}
