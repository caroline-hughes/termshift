import type { WorkOpportunity } from "@/lib/termshift-opportunities";
import {
	extractJsonLdObjects,
	extractMeta,
	extractTagContent,
	findJobPosting,
	firstMatch,
	normalizeWhitespace,
	stripScriptsAndStyles,
	stripTags,
	truncateText,
} from "@/lib/extract/html";

type TermInference = {
	blockType: "internship" | "work-term";
	termEndId: string;
	termLabel: string;
	termStartId: string;
};

export function inferBlockType(text: string) {
	return /\bco-?op\b|\bwork term\b/i.test(text) ? "work-term" : "internship";
}

export function inferTerm(text: string): TermInference {
	const lower = text.toLowerCase();
	const blockType = inferBlockType(text);

	const explicitSixMonthRanges: Array<{
		pattern: RegExp;
		result: Omit<TermInference, "blockType">;
	}> = [
		{
			pattern: /\b(january|jan)\s*[-–]\s*(june|jun)\s*(20\d{2})\b/i,
			result: {
				termEndId: "2028-summer1",
				termLabel: "January-June 2028",
				termStartId: "2028-spring",
			},
		},
		{
			pattern: /\b(july|jul)\s*[-–]\s*(december|dec)\s*(20\d{2})\b/i,
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

		if (entry.result.termStartId.startsWith("2028") && year !== "2028") {
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
				termEndId: `${year}-fall`,
				termLabel: `Fall ${year}`,
				termStartId:
					blockType === "work-term" ? `${year}-summer2` : `${year}-fall`,
			};
		}

		if (firstSeason === "spring") {
			return {
				blockType,
				termEndId:
					blockType === "work-term" ? `${year}-summer1` : `${year}-spring`,
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

export function inferFocusAreas(text: string) {
	const focusAreas: string[] = [];
	const lower = text.toLowerCase();

	if (/\brobot|\bautonomous\b|\bfulfillment\b/.test(lower)) {
		focusAreas.push("Robotics");
	}
	if (
		/\bdistributed\b|\bmicroservice|\bscalable\b|\bcloud\b/.test(lower)
	) {
		focusAreas.push("Distributed systems");
	}
	if (
		/\bai\b|\bml\b|machine learning|\bllm\b|\binference\b|\bnlp\b/.test(
			lower,
		)
	) {
		focusAreas.push("AI infrastructure");
	}
	if (/\bfull-stack\b|\bfrontend\b|\bweb\b/.test(lower)) {
		focusAreas.push("Full-stack");
	}
	if (
		/\bplatform\b|\btooling\b|developer productivity|\bsdk\b/.test(lower)
	) {
		focusAreas.push("Platform engineering");
	}
	if (
		/\bsimulation\b|\bperformance\b|\blow-level\b|\bsystems\b/.test(lower)
	) {
		focusAreas.push("Systems");
	}
	if (/\bproduct\b/.test(lower)) {
		focusAreas.push("Product engineering");
	}
	if (/\bdata\b/.test(lower)) {
		focusAreas.push("Data systems");
	}

	return focusAreas.slice(0, 3).length > 0
		? [...new Set(focusAreas)].slice(0, 3)
		: ["Software engineering"];
}

export function inferPreferredCourseIds(text: string) {
	const lower = text.toLowerCase();
	const preferred = new Set<string>(["cs3000"]);

	if (
		/object-oriented|\bdistributed\b|\bbackend\b|\bservice\b|\bcloud\b|\bplatform\b/.test(
			lower,
		)
	) {
		preferred.add("cs3100");
		preferred.add("cs3650");
	}

	if (/\bfull-stack\b|\bfrontend\b|\bweb\b|\bproduct\b/.test(lower)) {
		preferred.add("softwareB");
		preferred.add("softwareD");
	}

	if (
		/\bai\b|\bml\b|machine learning|\bdata\b|\binference\b|\bnlp\b/.test(
			lower,
		)
	) {
		preferred.add("ds3000");
	}

	if (/\brobot|\bhardware\b|\bembedded\b|\barchitecture\b|\bfirmware\b/.test(lower)) {
		preferred.add("eece2310");
	}

	if (
		/\bsimulation\b|\bperformance\b|\bcompiler\b|\bruntime\b|\bsystems\b/.test(
			lower,
		)
	) {
		preferred.add("cs3800");
		preferred.add("softwareC");
	}

	if (
		/\bcommunication\b|\bpresentation\b|\bcustomer\b|cross-functional|\bproduct\b/.test(
			lower,
		)
	) {
		preferred.add("presentation");
	}

	return [...preferred].slice(0, 4);
}

export function extractCompensation(text: string) {
	const hourlyMatch = text.match(
		/\$\s?(\d{1,3})(?:\s*[-–]\s*\$?\s?(\d{1,3}))?\s*\/?\s*hr\b/i,
	);
	if (hourlyMatch) {
		return hourlyMatch[2]
			? `$${hourlyMatch[1]}-$${hourlyMatch[2]}/hr`
			: `$${hourlyMatch[1]}/hr`;
	}

	const annualMatch = text.match(
		/\$\s?(\d{1,3}(?:,\d{3})+)(?:\.\d+)?\s*[-–]\s*\$\s?(\d{1,3}(?:,\d{3})+)(?:\.\d+)?/i,
	);
	if (annualMatch) {
		return `$${annualMatch[1]}-$${annualMatch[2]}`;
	}

	return undefined;
}

function buildLocation(
	jobPosting: Record<string, unknown> | null,
	html: string,
) {
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

	if (address && typeof address === "object") {
		const postalAddress = (address as Record<string, unknown>).address;
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

function buildCompany(
	jobPosting: Record<string, unknown> | null,
	html: string,
) {
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
			.replace(/\s+in [^|]+$/i, "")
			.replace(/\s+-\s+jobs\s+-\s+careers at .+$/i, "")
			.replace(/\s+-\s+[A-Za-z .]+,\s*[A-Z]{2}$/i, "");
		if (cleaned.trim()) return normalizeWhitespace(cleaned);
	}

	const pageTitle = extractTagContent(html, "title");
	if (pageTitle) {
		const cleaned = pageTitle
			.replace(/\s+\|\s+LinkedIn.*$/i, "")
			.replace(/\s+-\s+Indeed.*$/i, "")
			.replace(/^.+? hiring /i, "")
			.replace(/\s+in [^|]+$/i, "")
			.replace(/\s+-\s+jobs\s+-\s+careers at .+$/i, "")
			.replace(/\s+-\s+[A-Za-z .]+,\s*[A-Z]{2}$/i, "");
		if (cleaned.trim()) return normalizeWhitespace(cleaned);
	}

	return "Imported work term";
}

function buildSummary(
	jobPosting: Record<string, unknown> | null,
	html: string,
) {
	const description = jobPosting?.description;
	if (typeof description === "string" && description.trim()) {
		return stripTags(description).slice(0, 280);
	}

	const metaDescription =
		extractMeta(html, "description") || extractMeta(html, "og:description");
	if (metaDescription) return metaDescription.slice(0, 280);

	return "Imported from a public job posting. Review the source link for the full description.";
}

export function buildImportedOpportunityId(sourceUrl: string) {
	return `imported-${Buffer.from(sourceUrl)
		.toString("base64")
		.replace(/[^a-zA-Z0-9]/g, "")
		.slice(0, 18)}`;
}

export function toReadableJobText(html: string) {
	const jsonLdObjects = extractJsonLdObjects(html);
	const jobPosting = findJobPosting(jsonLdObjects);
	const title = extractTagContent(html, "title");
	const readableBody = stripTags(stripScriptsAndStyles(html));

	return truncateText(
		[
			jobPosting ? JSON.stringify(jobPosting) : "",
			title,
			extractMeta(html, "og:title"),
			extractMeta(html, "og:description"),
			extractMeta(html, "description"),
			readableBody,
		]
			.filter(Boolean)
			.join("\n"),
		14_000,
	);
}

export function extractJobFromHtml(
	html: string,
	sourceUrl: string,
): WorkOpportunity {
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

	return {
		blockType: term.blockType,
		company,
		compensation,
		focusAreas,
		id: buildImportedOpportunityId(sourceUrl),
		location,
		preferredCourseIds,
		schoolScope: ["Any"],
		sourceUrl,
		summary,
		termEndId: term.termEndId,
		termLabel: term.termLabel,
		termStartId: term.termStartId,
		title,
	};
}
