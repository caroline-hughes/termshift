import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, NoObjectGeneratedError } from "ai";
import type { z } from "zod";

export const EXTRACTION_MODEL = "gpt-4o-mini";
export const LLM_TIMEOUT_MS = 25_000;

export function getOpenAIApiKey() {
	return (process.env["OPENAI_API_KEY"] ?? "").trim();
}

export function hasOpenAIKey() {
	return Boolean(getOpenAIApiKey());
}

function sanitizeErrorMessage(message: string) {
	return message
		.replace(/sk-[a-zA-Z0-9_-]+/g, "[redacted]")
		.replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 200);
}

export function describeExtractionFailure(error: unknown): string {
	const name = error instanceof Error ? error.name : "";
	const message = sanitizeErrorMessage(
		error instanceof Error ? error.message : String(error),
	);
	const combined = `${name} ${message}`.toLowerCase();

	if (
		name === "TimeoutError" ||
		name === "AbortError" ||
		name === "DOMException" ||
		combined.includes("timeout") ||
		combined.includes("timed out") ||
		combined.includes("aborted")
	) {
		return "timeout";
	}

	if (
		NoObjectGeneratedError.isInstance(error) ||
		combined.includes("did not match schema") ||
		combined.includes("no object generated") ||
		combined.includes("invalid json") ||
		combined.includes("typevalidation") ||
		combined.includes("zod")
	) {
		return "schema";
	}

	if (
		combined.includes("api key") ||
		combined.includes("incorrect api") ||
		combined.includes("unauthorized") ||
		combined.includes("401")
	) {
		return "OpenAI authentication error";
	}

	if (combined.includes("429") || combined.includes("rate limit")) {
		return "OpenAI rate limit";
	}

	return "OpenAI error";
}

export function recordExtractionFailure(error: unknown) {
	const reason = describeExtractionFailure(error);
	const message = sanitizeErrorMessage(
		error instanceof Error ? error.message : String(error),
	);
	console.error(`Structured extraction failed (${reason}): ${message}`);
	return reason;
}

export async function generateStructured<T extends z.ZodType>(
	schema: T,
	options: { prompt: string; system: string },
): Promise<z.infer<T>> {
	const openai = createOpenAI({
		apiKey: getOpenAIApiKey(),
	});

	const { object } = await generateObject({
		abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS),
		model: openai(EXTRACTION_MODEL),
		prompt: options.prompt,
		schema,
		system: options.system,
		temperature: 0,
	});

	return object as z.infer<T>;
}
