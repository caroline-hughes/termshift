import { NextResponse } from "next/server";

type TermInference = {
	blockType: "internship" | "work-term";
	termEndId: string;
	termLabel: string;
	termStartId: string;
};

const USER_AGENT =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";

function normalizeWhitespace(value: string) {
	return value.replace(/\s+/g, " ").trim();
}

function decodeHtml(value: string) {
	return value
		.replace(/&amp;/g, "&")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&apos;/g, "'")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">");
}

function stripTags(value: string) {
	return normalizeWhitespace(decodeHtml(value.replace(/<[^>]+>/g, " ")));
}

function extractTagContent(html: string, tagName: string) {
	const match = html.match(
		new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, "i"),
	);

	return match ? stripTags(match[1]) : "";
}

function extractMeta(html: string, name: string) {
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

function extractJsonLdObjects(html: string) {
	const matches = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
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

function findJobPosting(jsonLdObjects: unknown[]) {
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
					(graphItem as Record<string, unknown>)["@type"] ===
						"JobPosting"
				) {
					return graphItem as Record<string, unknown>;
				}
			}
		}
	}

	return null;
}

function firstMatch(text: string, patterns: RegExp[]) {
	for (const pattern of patterns) {
		const match = text.match(pattern);
		if (match?.[1]) return normalizeWhitespace(match[1]);
	}

	return "";
}

function inferBlockType(text: string) {
	return /\bco-?op\b|\bwork term\b/i.test(text) ? "work-term" : "internship";
}

function inferTerm(text: string): TermInference {
	const lower = text.toLowerCase();
	const blockType = inferBlockType(text);

	const explicitSixMonthRanges: Array<{
		pattern: RegExp;
		result: Omit<TermInference, "blockType">;
	}> = [
		{
			pattern:
				/\b(january|jan)\s*[-–]\s*(june|jun)\s*(20\d{2})\b/i,
			result: {
				termEndId: "2028-summer1",
				termLabel: "January-June 2028",
				termStartId: "2028-spring",
			},
		},
		{
			pattern:
				/\b(july|jul)\s*[-–]\s*(december|dec)\s*(20\d{2})\b/i,
			result: {
				termEndId: "2027-fall",
				termLabel: "July-December 2027",
				termStartId: "2027-summer2",
			},
		},
	];

	for (const entry of explicitSixMonthRanges) {
		const match = text.match(entry.pattern);
		if (!match) continue;

		const year = match[3];

		if (
			entry.result.termStartId.startsWith("2028") &&
			year !== "2028"
		) {
			return {
				blockType,
				termEndId: `${year}-summer1`,
				termLabel: `January-June ${year}`,
				termStartId: `${year}-spring`,
			};
		}

		if (entry.result.termStartId.startsWith("2027") && year !== "2027") {
			return {
				blockType,
				termEndId: `${year}-fall`,
				termLabel: `July-December ${year}`,
				termStartId: `${year}-summer2`,
			};
		}

		return {
			blockType,
			...entry.result,
		};
	}

	const seasonMatch = lower.match(
		/\b(fall|spring|summer|winter)\s*\/?\s*(fall|spring|summer|winter)?\s*(20\d{2})\b/,
	);

	if (seasonMatch) {
		const firstSeason = seasonMatch[1];
		const secondSeason = seasonMatch[2];
		const year = seasonMatch[3];

		if (firstSeason === "fall") {
			return {
				blockType,
				termEndId: blockType === "work-term" ? `${year}-fall` : `${year}-fall`,
				termLabel: `Fall ${year}`,
				termStartId:
					blockType === "work-term" ? `${year}-summer2` : `${year}-fall`,
			};
		}

		if (firstSeason === "spring") {
			return {
				blockType,
				termEndId:
					blockType === "work-term"
						? `${year}-summer1`
						: `${year}-spring`,
				termLabel: `Spring ${year}`,
				termStartId: `${year}-spring`,
			};
		}

		if (firstSeason === "summer" && secondSeason === "fall") {
			return {
				blockType,
				termEndId: `${year}-fall`,
				termLabel: `July-December ${year}`,
				termStartId: `${year}-summer2`,
			};
		}

		if (firstSeason === "summer") {
			return {
				blockType,
				termEndId: `${year}-summer2`,
				termLabel: `Summer ${year}`,
				termStartId: `${year}-summer1`,
			};
		}

		if (firstSeason === "winter") {
			return {
				blockType,
				termEndId: `${year}-spring`,
				termLabel: `Winter ${year}`,
				termStartId: `${year}-spring`,
			};
		}
	}

	return {
		blockType,
		termEndId: "2027-fall",
		termLabel: "July-December 2027",
		termStartId: "2027-summer2",
	};
}

function inferFocusAreas(text: string) {
	const focusAreas: string[] = [];
	const lower = text.toLowerCase();

	if (/robot|autonomous|fulfillment/.test(lower)) focusAreas.push("Robotics");
	if (/distributed|microservice|scalable|cloud/.test(lower)) {
		focusAreas.push("Distributed systems");
	}
	if (/ai|ml|machine learning|llm|inference|nlp/.test(lower)) {
		focusAreas.push("AI infrastructure");
	}
	if (/full-stack|frontend|web/.test(lower)) {
		focusAreas.push("Full-stack");
	}
	if (/platform|tooling|developer productivity|sdk/.test(lower)) {
		focusAreas.push("Platform engineering");
	}
	if (/simulation|performance|low-level|systems/.test(lower)) {
		focusAreas.push("Systems");
	}
	if (/product/.test(lower)) {
		focusAreas.push("Product engineering");
	}
	if (/data/.test(lower)) {
		focusAreas.push("Data systems");
	}

	return focusAreas.slice(0, 3).length > 0
		? [...new Set(focusAreas)].slice(0, 3)
		: ["Software engineering"];
}

function inferPreferredCourseIds(text: string) {
	const lower = text.toLowerCase();
	const preferred = new Set<string>(["cs3000"]);

	if (/object-oriented|distributed|backend|service|cloud|platform/.test(lower)) {
		preferred.add("cs3100");
		preferred.add("cs3650");
	}

	if (/full-stack|frontend|web|product/.test(lower)) {
		preferred.add("softwareB");
		preferred.add("softwareD");
	}

	if (/ai|ml|machine learning|data|inference|nlp/.test(lower)) {
		preferred.add("ds3000");
	}

	if (/robot|hardware|embedded|architecture|firmware/.test(lower)) {
		preferred.add("eece2310");
	}

	if (/simulation|performance|compiler|runtime|systems/.test(lower)) {
		preferred.add("cs3800");
		preferred.add("softwareC");
	}

	if (/communication|presentation|customer|cross-functional|product/.test(lower)) {
		preferred.add("presentation");
	}

	return [...preferred].slice(0, 4);
}

function extractCompensation(text: string) {
	const hourlyMatch = text.match(/\$\s?(\d{1,3})(?:\s*[-–]\s*\$?\s?(\d{1,3}))?\s*\/?\s*hr\b/i);
	if (hourlyMatch) {
		return hourlyMatch[2]
			? `$${hourlyMatch[1]}-$${hourlyMatch[2]}/hr`
			: `$${hourlyMatch[1]}/hr`;
	}

	const annualMatch = text.match(/\$\s?(\d{1,3}(?:,\d{3})+)(?:\.\d+)?\s*[-–]\s*\$\s?(\d{1,3}(?:,\d{3})+)(?:\.\d+)?/i);
	if (annualMatch) {
		return `$${annualMatch[1]}-$${annualMatch[2]}`;
	}

	return undefined;
}

function buildLocation(jobPosting: Record<string, unknown> | null, html: string) {
	const address = jobPosting?.jobLocation;

	if (Array.isArray(address) && address[0] && typeof address[0] === "object") {
		const postalAddress = (address[0] as Record<string, unknown>).address;
		if (postalAddress && typeof postalAddress === "object") {
			const city = (postalAddress as Record<string, unknown>).addressLocality;
			const region = (postalAddress as Record<string, unknown>).addressRegion;
			if (typeof city === "string" && typeof region === "string") {
				return `${city}, ${region}`;
			}
		}
	}

	const title = extractTagContent(html, "title");
	const linkedinLocation = firstMatch(title, [
		/ hiring .*? in ([^|]+?) \| LinkedIn/i,
	]);
	if (linkedinLocation) return linkedinLocation;

	const headline = extractMeta(html, "og:title") || title;
	const careersLocation = firstMatch(headline, [
		/^[^-|]+-\s*([^|-]+?)\s*-\s*jobs\s*-\s*careers at /i,
		/^[^-|]+-\s*([^|-]+?)\s*-\s*careers at /i,
	]);
	if (careersLocation) return careersLocation;

	const indeedLocation = firstMatch(html, [
		/<h1[^>]*>[\s\S]*?<\/h1>[\s\S]*?<div[^>]*>([^<]+,\s*[A-Z]{2})<\/div>/i,
	]);
	if (indeedLocation) return indeedLocation;

	return "Location not listed";
}

function buildCompany(jobPosting: Record<string, unknown> | null, html: string) {
	const hiringOrganization = jobPosting?.hiringOrganization;
	if (hiringOrganization && typeof hiringOrganization === "object") {
		const name = (hiringOrganization as Record<string, unknown>).name;
		if (typeof name === "string" && name.trim()) {
			return normalizeWhitespace(name);
		}
	}

	const title = extractTagContent(html, "title");
	const linkedinCompany = firstMatch(title, [/^(.+?) hiring /i]);
	if (linkedinCompany) return linkedinCompany;

	const headline = extractMeta(html, "og:title") || title;
	const careersAtCompany = firstMatch(headline, [
		/\bcareers at ([^|]+)$/i,
		/\bjobs\s*-\s*careers at ([^|]+)$/i,
	]);
	if (careersAtCompany) return careersAtCompany;

	const siteNameCompany = extractMeta(html, "og:site_name");
	if (siteNameCompany) {
		const cleanedSiteName = siteNameCompany
			.replace(/\s+jobs?$/i, "")
			.replace(/\s+careers?$/i, "");
		if (cleanedSiteName.trim()) {
			return normalizeWhitespace(cleanedSiteName);
		}
	}

	const indeedCompany = firstMatch(html, [
		/<h1[^>]*>[\s\S]*?<\/h1>[\s\S]*?<div[^>]*>\s*([^<]+?)\s*<\/div>/i,
	]);
	if (indeedCompany) return indeedCompany;

	return "Imported company";
}

function buildTitle(jobPosting: Record<string, unknown> | null, html: string) {
	const jobTitle = jobPosting?.title;
	if (typeof jobTitle === "string" && jobTitle.trim()) {
		return normalizeWhitespace(jobTitle);
	}

	const headline = extractMeta(html, "og:title");
	if (headline) {
		const cleaned = headline
			.replace(/\s+\|\s+LinkedIn.*$/i, "")
			.replace(/\s+-\s+Indeed.*$/i, "")
			.replace(/^.+? hiring /i, "")
			.replace(/\s+in [^|]+$/i, "");
		if (cleaned.trim()) return normalizeWhitespace(cleaned);
	}

	const pageTitle = extractTagContent(html, "title");
	if (pageTitle) {
		const cleaned = pageTitle
			.replace(/\s+\|\s+LinkedIn.*$/i, "")
			.replace(/\s+-\s+Indeed.*$/i, "")
			.replace(/^.+? hiring /i, "")
			.replace(/\s+in [^|]+$/i, "");
		if (cleaned.trim()) return normalizeWhitespace(cleaned);
	}

	return "Imported work term";
}

function buildSummary(jobPosting: Record<string, unknown> | null, html: string) {
	const description = jobPosting?.description;
	if (typeof description === "string" && description.trim()) {
		return stripTags(description).slice(0, 280);
	}

	const metaDescription =
		extractMeta(html, "description") || extractMeta(html, "og:description");
	if (metaDescription) return metaDescription.slice(0, 280);

	return "Imported from a public job posting. Review the source link for the full description.";
}

export async function POST(request: Request) {
	try {
		const body = (await request.json()) as { url?: string };
		const rawUrl = body.url?.trim();

		if (!rawUrl) {
			return NextResponse.json(
				{ error: "Paste a job link to import it." },
				{ status: 400 },
			);
		}

		let parsedUrl: URL;
		try {
			parsedUrl = new URL(rawUrl);
		} catch {
			return NextResponse.json(
				{ error: "That job link does not look valid." },
				{ status: 400 },
			);
		}

		const response = await fetch(parsedUrl.toString(), {
			headers: {
				"accept-language": "en-US,en;q=0.9",
				"user-agent": USER_AGENT,
			},
			redirect: "follow",
		});

		if (!response.ok) {
			const hostname = parsedUrl.hostname.toLowerCase();
			const isIndeed = hostname.includes("indeed.");
			const isLinkedIn = hostname.includes("linkedin.");

			if (response.status === 403 && isIndeed) {
				return NextResponse.json(
					{
						error:
							"Indeed blocked automated access to this posting right now. Try another public Indeed link or test a seeded listing.",
					},
					{ status: 502 },
				);
			}

			if (response.status === 403 && isLinkedIn) {
				return NextResponse.json(
					{
						error:
							"LinkedIn blocked automated access to this posting right now. Try another public LinkedIn link or test a seeded listing.",
					},
					{ status: 502 },
				);
			}

			return NextResponse.json(
				{ error: "TermShift could not open that job posting right now." },
				{ status: 502 },
			);
		}

		const html = await response.text();
		const jsonLdObjects = extractJsonLdObjects(html);
		const jobPosting = findJobPosting(jsonLdObjects);
		const title = buildTitle(jobPosting, html);
		const company = buildCompany(jobPosting, html);
		const location = buildLocation(jobPosting, html);
		const summary = buildSummary(jobPosting, html);
		const combinedText = [
			title,
			company,
			location,
			summary,
			extractMeta(html, "description"),
			extractMeta(html, "og:description"),
			html.slice(0, 150000),
		].join(" ");
		const term = inferTerm(combinedText);
		const focusAreas = inferFocusAreas(combinedText);
		const preferredCourseIds = inferPreferredCourseIds(combinedText);
		const compensation =
			extractCompensation(combinedText) ||
			(typeof jobPosting?.baseSalary === "string"
				? normalizeWhitespace(jobPosting.baseSalary)
				: undefined);

		return NextResponse.json({
			opportunity: {
				blockType: term.blockType,
				company,
				compensation,
				focusAreas,
				id: `imported-${Buffer.from(parsedUrl.toString()).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 18)}`,
				location,
				preferredCourseIds,
				schoolScope: ["Any"],
				sourceUrl: parsedUrl.toString(),
				summary,
				termEndId: term.termEndId,
				termLabel: term.termLabel,
				termStartId: term.termStartId,
				title,
			},
		});
	} catch {
		return NextResponse.json(
			{
				error:
					"TermShift could not parse that job link yet. Try a public Indeed or LinkedIn posting.",
			},
			{ status: 500 },
		);
	}
}
