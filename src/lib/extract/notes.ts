import type { ExtractionFallbackReason, ExtractionSource } from "@/lib/extract/types";

export function buildJobExtractionNote(
	source: ExtractionSource,
	fallbackReason: ExtractionFallbackReason,
) {
	if (source === "llm") {
		return "Imported listing with structured extraction. Ready to test in plan.";
	}

	if (fallbackReason === "llm-error") {
		return "Imported with the local parser after structured extraction failed. Review the listing before testing it in plan.";
	}

	return "Imported with the local parser because no OpenAI API key is configured. Review the listing before testing it in plan.";
}

export function buildTranscriptExtractionNote(
	details: string,
	source: ExtractionSource,
	fallbackReason: ExtractionFallbackReason,
) {
	if (source === "llm") {
		return `${details} Structured extraction filled this snapshot from the uploaded document.`;
	}

	if (fallbackReason === "llm-error") {
		return `${details} Structured extraction was unavailable, so TermShift used the local parser.`;
	}

	return `${details} No OpenAI API key is configured, so TermShift used the local parser.`;
}
