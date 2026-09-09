import type { CrawlPage, CrawlResult } from "./crawler.ts";
import type {
  CompanyProfile,
  ProfileEvidence,
  ProfileField,
  SupportedProfileValue,
} from "../domain/company-profile.ts";
import { normalizeWebsite } from "../domain/website.ts";

export type CompanyProfileResult =
  | { ok: true; profile: CompanyProfile }
  | { ok: false; code: "invalid_crawl" | "crawl_failed" | "input_too_large" };

type FieldName = keyof CompanyProfile["fields"];
type Statement = { field: FieldName; value: string; evidence: ProfileEvidence };
const maxTextLength = 2 * 1024 * 1024;
const maxLineLength = 2000;
const maxStatements = 200;
// Exhaustive against the existing contract, including safe rejection of unknown codes.
const crawlFailureCodes: Readonly<
  Record<Extract<CrawlResult, { ok: false }>["code"], true>
> = {
  invalid_target: true,
  live_crawl_unavailable: true,
  busy: true,
  cancelled: true,
  timeout: true,
  unauthorized: true,
  quota_exceeded: true,
  rate_limited: true,
  provider_unavailable: true,
  provider_error: true,
  network_error: true,
  empty_result: true,
  invalid_response: true,
  response_too_large: true,
};
const firstPartyHeadings = new Set([
  "about us",
  "our company",
  "our product",
  "our services",
  "who we serve",
  "our use cases",
  "our capabilities",
  "our locations",
  "company profile",
]);
const labels: ReadonlyMap<string, FieldName> = new Map([
  ["company name", "companyName"],
  ["product name", "productName"],
  ["short description", "shortDescription"],
  ["primary product", "primaryProduct"],
  ["primary service", "primaryProduct"],
  ["target audience", "targetAudience"],
  ["target customers", "targetAudience"],
  ["industry", "industry"],
  ["category", "industry"],
  ["use case", "keyUseCases"],
  ["capability", "capabilities"],
  ["headquarters", "geography"],
  ["service area", "geography"],
  ["office location", "geography"],
]);
const sentenceForms: readonly (readonly [RegExp, FieldName])[] = [
  [/^Our company is called (.+)\.$/i, "companyName"],
  [/^Our product is called (.+)\.$/i, "productName"],
  [/^Our company provides (.+)\.$/i, "shortDescription"],
  [/^Our primary (?:product|service) is (.+)\.$/i, "primaryProduct"],
  [/^Our target customers are (.+)\.$/i, "targetAudience"],
  [/^Our industry is (.+)\.$/i, "industry"],
  [/^Our use cases include (.+)\.$/i, "keyUseCases"],
  [/^Our capabilities include (.+)\.$/i, "capabilities"],
];

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function crawlPage(value: unknown): value is CrawlPage {
  return (
    record(value) &&
    typeof value.url === "string" &&
    textOrNull(value.sourceUrl) &&
    textOrNull(value.title) &&
    textOrNull(value.description) &&
    textOrNull(value.language) &&
    textOrNull(value.markdown) &&
    (value.statusCode === null ||
      (typeof value.statusCode === "number" &&
        Number.isInteger(value.statusCode) &&
        value.statusCode >= 100 &&
        value.statusCode <= 599))
  );
}

function safeOrigin(value: string): string | null {
  if (!value.startsWith("https://") || /[<>]/.test(value)) return null;
  const website = normalizeWebsite(value);
  if (!website.ok) return null;
  const origin = new URL(value).origin;
  return origin === website.value.origin ? origin : null;
}

function statementText(
  line: string,
): { field: FieldName; value: string } | null {
  const text = line
    .trim()
    .replace(/^[-+*] +/, "")
    .replace(/^\*\*([^*]+:)\*\* */, "$1 ")
    .replace(/^\*\*([^*]+)\*\*: */, "$1: ");
  const label = /^([A-Za-z ]+): *(.*)$/.exec(text);
  if (label?.[1] !== undefined && label[2] !== undefined) {
    const field = labels.get(label[1].toLowerCase());
    if (field) return { field, value: field === "geography" ? text : label[2] };
  }
  for (const [pattern, field] of sentenceForms) {
    const match = pattern.exec(text);
    if (match?.[1] !== undefined) {
      // Check the claimed value before retaining the full description sentence.
      // An unsupported value must not invalidate other statements in its paragraph.
      if (!supportedText(match[1].trim().replace(/ +/g, " ")))
        return { field, value: "" };
      return { field, value: field === "shortDescription" ? text : match[1] };
    }
  }
  return null;
}

function supportedText(value: string): boolean {
  const content = value.replace(
    /^(?:Headquarters|Service area|Office location): */i,
    "",
  );
  return (
    content.length > 0 &&
    !/[<>\[\]`\\*_~\p{Cc}\p{Cf}]/u.test(value) &&
    !/^(?:unknown|n\/a|tbd|not specified|none|-)$/i.test(content) &&
    !/&(?:#\d+|#x[\da-f]+|[a-z][a-z\d]+);/i.test(value)
  );
}

/** Deliberately recognizes a small statement grammar, not general Markdown/NLP. */
function pageStatements(
  page: CrawlPage,
  pageIndex: number,
): Statement[] | null {
  const statements: Statement[] = [];
  let paragraph: Statement[] = [];
  let ambiguousContext = false;
  let offset = 0;
  let skipUnderline = false;
  let fence: { character: string; length: number } | undefined;
  const sections: { level: number; eligible: boolean }[] = [];
  const flush = () => {
    if (!ambiguousContext) statements.push(...paragraph);
    paragraph = [];
  };
  const lines = (page.markdown ?? "").split("\n");
  for (const [lineIndex, line] of lines.entries()) {
    // Bound each line before any grammar regex, including unsupported prose.
    if (line.length > maxLineLength) return null;
    const start = offset;
    offset += line.length + 1;
    if (skipUnderline) {
      skipUnderline = false;
      continue;
    }
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (
        marker?.[1]?.[0] === fence.character &&
        marker[1].length >= fence.length &&
        marker[2]?.trim() === ""
      )
        fence = undefined;
      continue;
    }
    if (marker?.[1]?.[0] !== undefined) {
      flush();
      ambiguousContext = true;
      fence = { character: marker[1][0], length: marker[1].length };
      continue;
    }
    // Indentation may belong to a nested quotation/list/code container. Do not
    // erase that context by trimming it into a first-party statement or heading.
    if (line.trim() && /^[ \t]/.test(line)) {
      ambiguousContext = true;
      continue;
    }
    const heading = /^ {0,3}(#{1,6}) +(.+?) *#*\s*$/.exec(line);
    const underline = /^ {0,3}(=+|-+)\s*$/.exec(lines[lineIndex + 1] ?? "");
    const setext =
      !heading && /^ {0,3}[^\s>]/.test(line) && underline?.[1] !== undefined;
    const headingText = heading?.[2] ?? (setext ? line.trim() : undefined);
    if (headingText !== undefined) {
      flush();
      ambiguousContext = false;
      const level =
        heading?.[1]?.length ?? (underline?.[1]?.[0] === "=" ? 1 : 2);
      skipUnderline = setext;
      while (sections.at(-1) && (sections.at(-1)?.level ?? 0) >= level)
        sections.pop();
      sections.push({
        level,
        eligible:
          (sections.at(-1)?.eligible ?? true) &&
          firstPartyHeadings.has(headingText.toLowerCase()),
      });
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    if (sections.at(-1)?.eligible === false) continue;
    if (/^(?: {4}|\t| {0,3}>)/.test(line)) {
      ambiguousContext = true;
      continue;
    }
    const match = statementText(line);
    if (!match) {
      ambiguousContext = true;
      continue;
    }
    if (ambiguousContext) continue;
    const value = match.value.trim().replace(/ +/g, " ");
    if (!supportedText(value)) continue;
    paragraph.push({
      ...match,
      value,
      evidence: {
        pageIndex,
        pageUrl: page.url,
        contentField: "markdown",
        start,
        end: start + line.length,
        quote: line,
      },
    });
    if (statements.length + paragraph.length > maxStatements) return null;
  }
  flush();
  return statements;
}

function fieldResult(
  statements: readonly Statement[],
  field: FieldName,
): ProfileField {
  const values: SupportedProfileValue[] = [];
  for (const statement of statements) {
    if (statement.field !== field) continue;
    const index = values.findIndex((claim) => claim.value === statement.value);
    const existing = values[index];
    if (existing)
      values[index] = {
        value: existing.value,
        evidence: [...existing.evidence, statement.evidence],
      };
    else
      values.push({ value: statement.value, evidence: [statement.evidence] });
  }
  const [first, second, ...rest] = values;
  if (!first) return { status: "unknown", reason: "no_supported_statement" };
  const conflictingHeadquarters =
    field === "geography" &&
    values.filter((claim) => /^Headquarters:/i.test(claim.value)).length > 1;
  if (
    second &&
    (conflictingHeadquarters ||
      (field !== "keyUseCases" &&
        field !== "capabilities" &&
        field !== "geography"))
  ) {
    return { status: "conflicting", values: [first, second, ...rest] };
  }
  return { status: "confirmed", values: [first, ...values.slice(1)] };
}

/** Pure interpretation only: retain the original crawl result with this profile. */
export function extractCompanyProfile(input: unknown): CompanyProfileResult {
  const invalid: CompanyProfileResult = { ok: false, code: "invalid_crawl" };
  const oversized: CompanyProfileResult = {
    ok: false,
    code: "input_too_large",
  };
  if (!record(input)) return invalid;
  if (input.ok === false)
    return typeof input.code === "string" &&
      Object.hasOwn(crawlFailureCodes, input.code)
      ? { ok: false, code: "crawl_failed" }
      : invalid;
  if (input.ok !== true || !Array.isArray(input.pages)) return invalid;
  if (input.pages.length > 20) return oversized;
  const pages: CrawlPage[] = [];
  let textLength = 0;
  let origin: string | undefined;
  for (const candidate of input.pages) {
    if (!crawlPage(candidate)) return invalid;
    for (const text of [
      candidate.url,
      candidate.sourceUrl,
      candidate.title,
      candidate.description,
      candidate.language,
      candidate.markdown,
    ])
      textLength += text?.length ?? 0;
    if (textLength > maxTextLength) return oversized;
    const pageOrigin = safeOrigin(candidate.url);
    if (
      !pageOrigin ||
      (origin !== undefined && origin !== pageOrigin) ||
      (candidate.sourceUrl !== null &&
        safeOrigin(candidate.sourceUrl) !== pageOrigin)
    )
      return invalid;
    origin = pageOrigin;
    pages.push(candidate);
  }
  const statements: Statement[] = [];
  const excludedPages: {
    pageIndex: number;
    reason: "http_error" | "unsupported_markup";
  }[] = [];
  for (const [pageIndex, page] of pages.entries()) {
    if (
      page.statusCode !== null &&
      (page.statusCode < 200 || page.statusCode >= 300)
    ) {
      excludedPages.push({ pageIndex, reason: "http_error" });
      continue;
    }
    // Dropping HTML-bearing content avoids inventing a partial HTML parser and
    // mistakenly interpreting hidden elements/comments as company assertions.
    if (/<|&(?:#\d+|#x[\da-f]+|[a-z][a-z\d]+);/i.test(page.markdown ?? "")) {
      excludedPages.push({ pageIndex, reason: "unsupported_markup" });
      continue;
    }
    const extracted = pageStatements(page, pageIndex);
    if (!extracted || statements.length + extracted.length > maxStatements)
      return oversized;
    statements.push(...extracted);
  }
  return {
    ok: true,
    profile: {
      methodVersion: "company-profile-v2",
      fields: {
        companyName: fieldResult(statements, "companyName"),
        productName: fieldResult(statements, "productName"),
        shortDescription: fieldResult(statements, "shortDescription"),
        primaryProduct: fieldResult(statements, "primaryProduct"),
        targetAudience: fieldResult(statements, "targetAudience"),
        industry: fieldResult(statements, "industry"),
        keyUseCases: fieldResult(statements, "keyUseCases"),
        capabilities: fieldResult(statements, "capabilities"),
        geography: fieldResult(statements, "geography"),
      },
      excludedPages,
    },
  };
}
