# Secure crawl execution decision

## C4 decision

For the initial scanner, keep hosted Firecrawl `/v2/scrape` closed and use a native one-entry-page HTTPS transport for first-party website evidence.

The accepted website-intake boundary produces a `ValidatedWebsiteTarget` with a canonical HTTPS origin and a finite snapshot of screened public IP addresses. A live transport must use one of those exact addresses at connection time while preserving the original hostname for TLS certificate verification and SNI. Hosted Firecrawl accepts a target URL but does not provide a mechanism for NestedWeb to supply or enforce that screened destination address, so sending the URL to Firecrawl would not satisfy ADR-007's pinning requirement.

Self-hosting Firecrawl is not selected for V1. Its browser/worker stack would materially increase deployment and SSRF surface for a use case that currently needs only one first-party entry page. This is a scope and security decision, not a claim that Firecrawl is generally unsafe or unsuitable for other products.

## Native transport contract

`src/infrastructure/native-entry-crawler.ts` provides the reviewed transport boundary. It:

- accepts only a `ValidatedWebsiteTarget` issued in this process;
- connects to an exact screened IP literal from that target rather than resolving the hostname again;
- uses HTTPS on port 443 only;
- preserves the original hostname in TLS `servername`, certificate identity checks, and the HTTP `Host` header;
- disables connection reuse for the request and does not configure a proxy;
- performs a single static GET entry-page fetch with no browser execution, JavaScript, forms, cookies, authentication credentials, subresource loading, PDF parsing, or background jobs;
- accepts only HTML/XHTML with UTF-8, UTF8, or US-ASCII-compatible decoding and identity content encoding;
- caps the response at 2 MiB and the extracted inert text at 1 MiB;
- enforces a 15-second total deadline and propagates cancellation;
- follows at most three explicitly inspected redirects, only when the resulting URL remains HTTPS on the exact canonical origin; every redirect continues to use the same screened IP;
- converts supported visible static HTML into conservative Markdown-like inert text locally; scripts, styles, navigation, forms, embedded objects, hidden content, code/preformatted blocks, and other non-evidence surfaces are discarded;
- returns only the existing `CrawlResult` contract and does not expose transport diagnostics or raw network errors.

The injected `PinnedHttpsExchange` exists for deterministic fault-injection tests. It is a trusted infrastructure seam and must never be accepted from browser or customer input.

## Firecrawl status

`src/infrastructure/firecrawl.ts` remains unchanged in its operational posture: without an explicitly injected reviewed exchange it returns `live_crawl_unavailable`. An API key does not enable hosted live crawling. No Firecrawl credential is required by the native crawler.

Future adoption of a hosted or self-hosted crawling provider requires a new review demonstrating that its actual network path satisfies the same destination, redirect, private-address, response-bound, cancellation, retention, and usage requirements. Output URL validation after a provider request is not a substitute for transport-level SSRF controls.

## What C4 does not enable

C4 does not add a route, button, public API, scheduler, worker loop, project action, or paid external call. The crawler is infrastructure only. A future execution use case must still:

1. authenticate the actor or service boundary;
2. authorize the current workspace/project membership where a user initiated the work;
3. reserve/enforce usage and concurrency before execution where external paid work is involved;
4. pass only a freshly prepared target into the crawler;
5. persist raw crawl evidence and method/provenance before downstream interpretation;
6. keep all crawled text inert and untrusted.

The current native fetch itself has no third-party per-request fee, but that does not remove tenant authorization, abuse prevention, concurrency, or operational resource limits from the eventual orchestrator.

## Deployment requirement

Code-level public-address screening is not sufficient to describe every production network. Before a routed or worker-accessible live crawl is enabled, deployment egress controls must additionally deny organization-private, service-mesh, metadata, control-plane, and other internal routes that may exist inside otherwise globally routable address space. The production host must permit direct pinned HTTPS connections without an implicit HTTP(S) proxy that would re-resolve the hostname or choose a different destination.

If the deployment platform cannot guarantee those properties, live native crawling remains disabled until an independently reviewed egress gateway can enforce them.

## Product limitations

This is deliberately **not** a browser renderer. JavaScript-only sites, content behind consent/authentication, dynamically loaded pages, and information absent from the entry page may yield incomplete or empty evidence. The product must report that incompleteness; it must not synthesize missing company facts or silently fall back to a less constrained crawler.

A successful fetch proves only that NestedWeb received bytes from a TLS endpoint for the requested hostname at a screened address. It does not prove domain ownership, factual truth, freshness beyond collection time, or that a website claim is trustworthy. Company Profile interpretation remains a separate versioned step with its own evidence rules.

## Verification

C4 tests use injected exchanges only; CI makes no public crawl requests. Required exit gate:

- pinned-address request options preserve hostname TLS identity;
- raw/copied/forged targets cannot execute;
- same-origin redirects stay on the same screened address and are bounded;
- cross-origin, non-HTTPS, credential-bearing, alternate-port, and IP redirects fail closed;
- time, byte, charset, content-type, content-encoding, malformed-body, and cancellation limits fail closed;
- hidden/executable/navigation content does not become crawl evidence;
- produced evidence remains compatible with the deterministic Company Profile extractor;
- existing Firecrawl default live path remains closed;
- `npm run verify` and `npm audit --audit-level=high` pass before merge.
