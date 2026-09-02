export function normalizeWhitespace(value: string) {
	return value.replace(/\s+/g, " ").trim();
}

export function decodeHtml(value: string) {
	return value
		.replace(/&amp;/g, "&")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&apos;/g, "'")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">");
}

export function stripTags(value: string) {
	return normalizeWhitespace(decodeHtml(value.replace(/<[^>]+>/g, " ")));
}

export function extractTagContent(html: string, tagName: string) {
	const match = html.match(
		new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, "i"),
	);

	return match ? stripTags(match[1]) : "";
}

export function extractMeta(html: string, name: string) {
	const patterns = [
		new RegExp(
			`<meta[^>]+property=["']${name}["'][^>]+content=["']([\\s\\S]*?)["'][^>]*>`,
			"i",
		),
		new RegExp(
			`<meta[^>]+content=["']([\\s\\S]*?)["'][^>]+property=["']${name}["'][^>]*>`,
			"i",
		),
		new RegExp(
			`<meta[^>]+name=["']${name}["'][^>]+content=["']([\\s\\S]*?)["'][^>]*>`,
			"i",
		),
		new RegExp(
			`<meta[^>]+content=["']([\\s\\S]*?)["'][^>]+name=["']${name}["'][^>]*>`,
			"i",
		),
	];

	for (const pattern of patterns) {
		const match = html.match(pattern);
		if (match) return stripTags(match[1]);
	}

	return "";
}

export function extractJsonLdObjects(html: string) {
	const matches = [
		...html.matchAll(
			/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
		),
	];
	const results: unknown[] = [];

	for (const match of matches) {
		const raw = match[1]?.trim();
		if (!raw) continue;

		try {
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) {
				results.push(...parsed);
				continue;
			}

			results.push(parsed);
		} catch {
			continue;
		}
	}

	return results;
}

export function findJobPosting(jsonLdObjects: unknown[]) {
	for (const candidate of jsonLdObjects) {
		if (!candidate || typeof candidate !== "object") continue;

		const record = candidate as Record<string, unknown>;
		const type = record["@type"];

		if (type === "JobPosting") return record;

		if (Array.isArray(record["@graph"])) {
			for (const graphItem of record["@graph"] as unknown[]) {
				if (
					graphItem &&
					typeof graphItem === "object" &&
					(graphItem as Record<string, unknown>)["@type"] === "JobPosting"
				) {
					return graphItem as Record<string, unknown>;
				}
			}
		}
	}

	return null;
}

export function firstMatch(text: string, patterns: RegExp[]) {
	for (const pattern of patterns) {
		const match = text.match(pattern);
		if (match?.[1]) return normalizeWhitespace(match[1]);
	}

	return "";
}

export function stripScriptsAndStyles(html: string) {
	return html
		.replace(/<script[\s\S]*?<\/script>/gi, " ")
		.replace(/<style[\s\S]*?<\/style>/gi, " ");
}

export function truncateText(value: string, maxChars: number) {
	if (value.length <= maxChars) return value;
	return `${value.slice(0, maxChars)}\n[truncated]`;
}
