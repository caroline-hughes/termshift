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
		.slice(0, 160);
}

function collectErrorMessages(error: unknown) {
	const parts: string[] = [];
	let current: unknown = error;
	const seen = new Set<unknown>();

	while (current && typeof current === "object" && !seen.has(current)) {
		seen.add(current);
		if (current instanceof Error && current.message.trim()) {
			parts.push(current.message);
		}

		const record = current as { cause?: unknown };
		current = record.cause;
	}

	if (parts.length === 0 && error != null) {
		parts.push(String(error));
	}

	return sanitizeErrorMessage(parts.join(" — "));
}

function formatFailureDetail(bucket: string, message: string) {
	if (!message) return bucket;
	if (message.toLowerCase().startsWith(bucket.toLowerCase())) {
		return message;
	}
	return `${bucket}: ${message}`;
}

export function describeExtractionFailure(error: unknown): string {
	const name = error instanceof Error ? error.name : "";
	const message = collectErrorMessages(error);
	const combined = `${name} ${message}`.toLowerCase();

	if (
		name === "TimeoutError" ||
		name === "AbortError" ||
		name === "DOMException" ||
		combined.includes("timeout") ||
		combined.includes("timed out") ||
		combined.includes("aborted")
	) {
		return formatFailureDetail("timeout", message);
	}

	if (
		NoObjectGeneratedError.isInstance(error) ||
		combined.includes("did not match schema") ||
		combined.includes("no object generated") ||
		combined.includes("invalid json") ||
		combined.includes("typevalidation") ||
		combined.includes("zod")
	) {
		return formatFailureDetail("schema", message);
	}

	if (
		combined.includes("api key") ||
		combined.includes("incorrect api") ||
		combined.includes("unauthorized") ||
		combined.includes("401")
	) {
		return formatFailureDetail("OpenAI authentication error", message);
	}

	if (combined.includes("429") || combined.includes("rate limit")) {
		return formatFailureDetail("OpenAI rate limit", message);
	}

	return formatFailureDetail("OpenAI error", message);
}

export function recordExtractionFailure(error: unknown) {
	const reason = describeExtractionFailure(error);
	console.error(`Structured extraction failed (${reason})`);
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
		providerOptions: {
			openai: {
				strictJsonSchema: true,
			},
		},
		schema,
		system: options.system,
		temperature: 0,
	});

	return object as z.infer<T>;
}
