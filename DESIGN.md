# AI Visibility OS design system

Direction: **Premium B2B Intelligence / Precision Analytics**. This is the single visual contract. `src/app/globals.css` implements these tokens; change both together.

## Provenance

Generated on 2026-09-07 from the repository root with the requested `npx getdesign@latest add airtable` (Windows invocation: `npx.cmd --yes getdesign@latest add airtable`, getdesign 0.6.25). The complete original is archived at [airtable.generated.md](docs/reference/airtable.generated.md) for provenance only. Its marketing rules are not active requirements. Source: [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md), MIT.

The reference describes Airtable's marketing site. Retain white canvas, dark ink, clear hierarchy, a 4px spacing unit, and restrained elevation. Adapt these into structured data layouts and workspace navigation. Remove signature brand panels, licensed Haas fonts, pricing-specific typography, large marketing gaps, and pill CTAs. Add hover, error, loading, charts, accessibility, and evidence rules. Do not use Airtable branding or imply affiliation.

## Hierarchy and density

An analyst must identify scope, observation date, result, and evidence in that order. An agency must always know whose project it is viewing. Use page title, short description, context/filter row, primary data surface, then supporting detail. Prefer a table when users compare rows. Avoid decorative widgets and synthetic scores.

The current shell has no workspace or production data. It identifies itself as a product preview and explains the evidence method. No fake accounts, subscriptions, scan controls, numerical dashboard, or inactive navigation.

## Colors

Light mode only. Dark mode needs a separately verified palette.

| CSS token                       | Value                                                 | Role                          |
| ------------------------------- | ----------------------------------------------------- | ----------------------------- |
| `--background`                  | `#f8fafc`                                             | Page                          |
| `--foreground`                  | `#181d26`                                             | Headings and main text        |
| `--card`                        | `#ffffff`                                             | Data surface                  |
| `--muted`                       | `#eef2f6`                                             | Table headers, quiet surfaces |
| `--muted-foreground`            | `#526071`                                             | Supporting text               |
| `--border`                      | `#d8dee7`                                             | Decorative dividers           |
| `--input`                       | `#738196`                                             | Essential control outlines    |
| `--primary`                     | `#181d26`                                             | Primary action                |
| `--primary-hover`               | `#303b4b`                                             | Primary hover                 |
| `--primary-foreground`          | `#ffffff`                                             | Text on primary               |
| `--accent`                      | `#e8effa`                                             | Selection surface             |
| `--accent-foreground`           | `#174b97`                                             | Links, active navigation      |
| `--success`                     | `#166534`                                             | Successful outcome            |
| `--warning`                     | `#854d0e`                                             | Partial result / attention    |
| `--destructive`                 | `#b42318`                                             | Error / destructive action    |
| `--ring`                        | `#1b61c9`                                             | Keyboard focus                |
| `--chart-1` through `--chart-5` | `#1b61c9`, `#087e8b`, `#9a6700`, `#7952a3`, `#b44732` | Stable categorical series     |

Use semantic Tailwind utilities, not arbitrary palette classes. Semantic text colors belong on white/background, not on each other. Use labels alongside status color. Verify each pairing: 4.5:1 normal text, 3:1 large text and essential controls. Decorative borders are not control boundaries.

## Typography, spacing, shape, and depth

- System UI stack (`system-ui`, Segoe UI, sans-serif); one family, no remote font dependency. Tabular numerals for metrics and numeric columns.
- Body 16px/1.5, tables 14px/1.5, metadata 13px/1.5; minimum 12px for nonessential captions. Titles 24–32px/1.2 at weight 600; preview headline up to 48px. Weight 400 for body, 500 for labels.
- Spacing: 4, 8, 12, 16, 24, 32, 48px using Tailwind's standard scale. Typical sections 32px apart, panel padding 24px, compact rows 40px, comfortable rows 48px. No parallel spacing token set.
- `--radius`: 8px surfaces; 6px controls; 4px status labels. Circles only for avatars; no pill default.
- One-pixel dividers, flat data surfaces. `--shadow-popover: 0 8px 24px rgb(24 29 38 / 12%)` only for floating layers. No glow or shadow on every card.

## Layout, navigation, and agency workspaces

- Desktop: 240px rail when real navigation exists, 64px context header, 24–32px content gutters. Tables use available width; reading pages cap at 1120px and prose at 70 characters.
- Workspace selection precedes project selection. Show both in reports/evidence. Switching workspace clears project selection, filters, caches, and evidence panels; never flash the prior tenant's data.
- Every navigation item leads to a real route. Active links use `aria-current="page"`, selection surface, and weight. Prefer icons with labels.
- Under 1024px condense secondary controls; under 768px one column and 16px gutters. Introduce an accessible navigation drawer only when needed. At 320px no page-level horizontal scrolling.
- Wide tables can scroll inside a labeled keyboard-accessible region. Preserve headers and identifying columns; do not silently hide evidence, units, or failure status on mobile.

## Components and states

- **Buttons:** native semantics, concrete action verbs, one primary action per task. Standalone/touch targets at least 44px. Dark primary, outlined secondary, link for navigation. Hover changes tone, pressed darkens, focus uses 2px ring/3px offset. Disabled actions explain why nearby; no unexplained dead controls.
- **Forms:** associated visible labels, 44px inputs, units/help before entry. Preserve values after failure. `aria-invalid` and `aria-describedby` connect errors; focus an error summary after unsuccessful submit. Server repeats validation.
- **Tables:** semantic caption, `th scope`, left text/right numbers, explicit units/time zone. Sort buttons with `aria-sort` on headers. Truthful pagination/count. Bulk actions show selection scope and reauthorize execution.
- **Status badges:** text plus optional symbol. Neutral queued, accent running, success complete, warning partial, destructive failed. Compact rectangles; zero results is not a failed scan.
- **Empty states:** distinguish no observations from no filter matches. Explain a real next action; if unavailable, use plain explanation rather than fake buttons.
- **Loading:** reserve layout, `aria-busy` on affected region, polite job status. Percentages only when measured. Skeletons represent layout, not fabricated values.
- **Errors:** actionable summary, safe retry, correlation ID. Preserve partial results; never expose raw errors, stack traces, keys, or payloads.
- **Overlays:** use official shadcn/Radix for real complex interactions. Accessible title, focus trap, Escape, focus restoration. No custom modal framework.

## Charts, scores, and evidence

- A chart answers one question. Label time range, unit, provider/model scope, sample count, missingness, legend. Provide accessible text/table equivalent and keyboard access to tooltip content.
- Stable entity-to-color mapping plus dash/marker distinctions. Missing is a gap, not zero. Bars start at zero; disclose nonzero line scales. Compare compatible cohorts; no 3D charts or decorative gauges.
- Metrics expose numerator, denominator, and method version. “Not measured” is not `0%`. No composite AI score without a reviewed method. See [data-methodology.md](docs/data-methodology.md).
- Evidence connects to exact observation, query/version, provider/model, timestamp/time zone, cited URL, and normalization version. Separate provider-supplied citations from fetched/verified sources. Render excerpts as untrusted text with attribution.
- Long URLs wrap. Validate HTTP(S) schemes before rendering links. No auto-fetching, link previews, or raw HTML. A citation does not establish that its source supports a claim.
- Recommendations label themselves as interpretations and show evidence, limitations, confidence basis, and contradictory evidence where present. No promises of controlling AI answers.

## Accessibility and motion

Semantic landmarks, one h1, sequential headings, skip link, visible focus, meaningful names, keyboard operation, 200% zoom/reflow. Status changes use polite live regions; do not announce every table row. Tables stay tables unless an interactive grid is necessary. Respect forced colors and reduced motion. Transitions 120–180ms; reduced motion removes them. No autoplay, animated chart entrances, flashing, glass, neon, gradients, or decorative AI imagery.

## Implementation and verification

Use native HTML for the current static shell. Install an official shadcn component when a repeated or complex interaction justifies it, map it to these tokens, and review generated source. The skill is installed; no component kit or Radix runtime is needed yet.

For UI changes, run `npm run verify`, inspect desktop/mobile screenshots, exercise keyboard flow, and verify actual empty/loading/error states as implemented. Axe complements manual review; it does not prove complete accessibility compliance.
