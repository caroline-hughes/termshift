import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import type { z } from "zod";

export const EXTRACTION_MODEL = "gpt-4o-mini";

export function hasOpenAIKey() {
	return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export async function generateStructured<T extends z.ZodType>(
	schema: T,
	options: { prompt: string; system: string },
): Promise<z.infer<T>> {
	const openai = createOpenAI({
		apiKey: process.env.OPENAI_API_KEY,
	});

	const { object } = await generateObject({
		abortSignal: AbortSignal.timeout(12_000),
		model: openai(EXTRACTION_MODEL),
		prompt: options.prompt,
		schema,
		system: options.system,
		temperature: 0,
	});

	return object as z.infer<T>;
}
