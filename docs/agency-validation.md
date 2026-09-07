# Task 02 — Manual agency workflow validation

Status: **In progress — five conversations reported complete; closure documentation pending.** The user conducted the conversations manually and reports positive concept interest. Individual findings and the concrete paid-pilot test outcome have not been supplied, so the minimum completion criteria are not yet documented and Task 02 is not marked Done. Codex must not search for contacts, send outreach, implement product functionality, or start Task 03. Follow the [product contract](product-scope.md) and [evidence methodology](data-methodology.md).

## Current evidence and dependencies

- Conversations: **5 completed, as reported by the user**. Individual conversation results documented: **0 of 5**; the message referenced results "below" but did not include them.
- Paid-pilot outcome: **not provided**; whether a concrete test occurred is unknown. The **$49–99 per first pilot/report** range is the hypothesis supplied in Task 02, not validated pricing or a subscription plan.
- Most common pain, most requested output, biggest objection, and pricing signal: **unknown**. No customer findings have been inferred from the product specification.
- Product changes: none justified by customer evidence yet. Task 03 should not proceed pending validation and review.
- Notion: **not updated**. No callable Notion connector or enabled browser surface was available during preparation; the Execution Tracker link and access are still needed.

Codex does not need contacts or outreach access. Use only the existing **AI Visibility OS — Execution Tracker**; do not create a replacement tracker. Its Task 02 entry has not been inspected, so readiness is **unverified**, not confirmed. Preparation, prospect lists, unanswered invitations, public website claims, and hypothetical answers do not count as conversations.

## User-reported validation update

Source: the user's Task 02 closure request in this conversation. The user stated:

> I personally spoke with five target SEO/GEO agency prospects. They responded positively to the product concept and want this product.

This records the user's aggregate report, not five separate interview transcripts or participant quotations. No agency identities, dates, client counts, current workflows/tools, specific pains, desired evidence/client outputs, reporting frequency, workarounds, objections, price reactions, or individual wording were supplied. Do not assign the aggregate statement to invented agency records or interpret concept interest as willingness to pay.

Closure requires the five individual results, including documented workflows, pains, and objections, plus at least one concrete paid-pilot test with its actual price, deliverable, and response. A negative offer response can satisfy the test requirement; payment is not required. Until those details are supplied, the most common pain, most requested output, biggest objection, pricing signal, and paid-pilot result remain unknown. No product change or proceed/modify decision is inferred.

The user subsequently supplied **Task 03 — Create the First Real AI Visibility Report**, explicitly authorizing a report specification and empty working prototype. [ADR-004](../ARCHITECTURE.md#adr-004-report-contract-before-the-data-pipeline) records this bounded authorization despite the interview documentation gaps above. It does not supply missing interview/pilot findings or mark Task 02 Done. The earlier Notion draft below remains an unsaved historical draft; no Notion update is claimed.

## Participants and recording

Complete at least five genuine conversations with people at SEO/GEO agencies managing multiple B2B SaaS/client websites. Aim for five distinct agencies; record repeated participants from one agency separately so they do not inflate the number of independent agencies. Record the participant's role, relevant client count, and involvement in delivery or purchasing. Do not substitute solo SaaS founders, general marketers, consumers, or generic SEO freelancers.

Explain the research purpose. Ask permission before recording audio or retaining client artifacts. Prefer redacted examples; keep contact details, recordings, client reports, and payment evidence in an appropriately private location, not committed into Git. Use participant IDs in synthesis and link to accessible private evidence. Verbatim quotes must match the source; otherwise label them as paraphrases. An unanswered question stays unknown.

## Interview guide — approximately 30 minutes

Ask about actual behavior before describing the proposed solution. Do not read the pain/output lists as answers to choose from until the participant has responded unaided.

1. **Context and current concern (5 minutes).** What does your agency do, what is your role, and how many relevant client websites do you manage? Tell me about the last time a client asked about appearing in AI answers. How did you establish whether the brand was mentioned, recommended, or cited? If it has not come up, record that.
2. **Current measurement workflow (8 minutes).** Walk me through the most recent measurement/report, from choosing questions to sending results. Which AI surfaces and tools did you use? Where did you keep prompts, responses, screenshots, citations, and history? Who did each step, how often, and how much time did it take? Record estimates as estimates. No measurement is a valid finding.
3. **Pain and workaround (7 minutes).** Which step was hardest, if any? Describe a recent example and its consequence. What did you do instead? Probe only as needed for repetitive work, weak evidence, competitor tracking, proving results, historical comparison, unreliable metrics, and analyst time. What already works well enough that you would keep it?
4. **Evidence and client output (5 minutes).** What did you actually send to the client, and what decision did it change? What evidence would make a result credible or cause you to reject it? If possible, inspect a redacted example. After the unaided answer, probe mentions, provider recommendations, competitors, citations, trends, lost opportunities, prioritized actions, and client-ready reports. Separate must-have outputs from nice-to-have outputs and record reporting frequency/integration needs.
5. **Value, concrete offer, and objections (5 minutes).** What do you currently spend in tools or analyst time? If a report reliably provided the evidence you need, what would you expect to pay per client report? Record the unprompted expectation first. Then test the offer below, ask for the strongest objection and a concrete next step, and record who can approve a purchase. End with anything missed.

## Concrete paid-pilot test

Working offer for a live test, not an offer already accepted or a promise of delivery:

> We are testing a manually produced, evidence-backed AI visibility report for one B2B SaaS brand: where it appears, which competitors appear instead, and which sources the AI system cites. For a first pilot, the proposed price is **$79 for one report**. We would agree on ten buyer-intent prompts and one AI/search surface before starting. The report would retain the prompts, dated answers and returned citations, distinguish mentions from recommendations, explain limitations, and suggest up to three specific actions where the evidence supports them. Would you choose a client and take the next step toward a paid pilot at that price? What would prevent that?

$79 is a proposed test point within the user's $49–99 hypothesis. Record the exact price/currency and scope actually presented; the dollar currency must be confirmed with the participant before an actual offer. If testing $49 or $99 or changing the scope, log the change and reason. Do not interpret different offers as a controlled pricing experiment.

Agree on the actual surface, questions, safe data access, deliverable format, and feasible delivery date before a commitment. One snapshot cannot substantiate a historical trend. Include missing/refused results and missing citations honestly. Do not promise rankings, accuracy guarantees, unlimited scans, all-provider coverage, or unbuilt software. Fulfilment, if agreed later, uses existing tools manually; this task adds no APIs, scanner, or billing system.

A **concrete test** means presenting a named qualified participant with an actual price and defined deliverable and asking for a purchase-related next step. Record whether they declined, deferred, requested a scope change, asked for an invoice/payment link, committed, or paid. A generic “would use it” answer is not a test. A completed test can be negative; payment is stronger evidence, not a condition for counting a properly conducted test. An invoice request or verbal commitment is not payment. Record payment only when confirmed by an actual transaction; do not build a payment flow.

## Conversation record — blank template, not findings

Copy once per completed conversation into the private research record:

```text
Conversation ID:
Date, time zone, channel, interviewer:
Agency/person (or private identity reference):
Agency type and participant role:
Number of relevant clients; qualification basis:
Source notes/recording reference; recording/artifact permission:
Q1 — Current concern about AI visibility; recent client example:
Q2 — Current workflow and tools used:
Reporting frequency; analyst time (measured or estimated):
Q3 — Biggest pain; concrete example and consequence:
Current workaround; what already works:
Evidence needed; evidence rejected and why:
Q5 — Output actually sent/wanted; client decision it supports:
Q4 — Unprompted willingness to pay; budget owner:
Pilot offered? Exact price/currency, scope, and wording:
Price reaction; purchase-related next step:
Strongest objection; required surfaces/integrations/history:
Exact quote(s) with source location, or explicitly labeled paraphrase:
Pilot result (not tested / declined / deferred / scope change /
              invoice requested / committed / paid):
Evidence of result; follow-up owner/date if agreed:
Unknowns and contradictory evidence:
Interviewer interpretation (separate from participant statements):
```

## Objections and synthesis

Record objections verbatim when possible, what triggered them, and whether they block a purchase. Probe manual alternatives, client indifference, reliability, changing answers, required AI surfaces, client reporting, history, price, and workflow integration without assuming any occurred.

After each conversation, extract current behavior, pain, desired output, objection, and pricing signal with conversation IDs. Group repeated themes across distinct agencies and report counts against the actual interviewed sample; retain disagreements and negative results. Separate requested features from observed problems and suggested product changes. Do not claim product-market fit, market-wide demand, or causation from five interviews.

## Completion and decision

- At least five genuine qualified agency conversations completed with the requested fields recorded; missing answers remain explicit.
- Current workflows, pains, desired outputs, and objections documented with source references.
- At least one concrete paid-pilot offer tested and its actual result documented.
- Synthesis distinguishes repeated pains, existing analyst spend, evidence/citation demand, competitor needs, willingness to pay, and a repeatable workflow from assumptions.
- A **continue / modify / stop** recommendation is tied to evidence, contradictory findings, and remaining unknowns. Meeting the research minimum is not automatically positive validation. State whether the scope of Task 03 should stay unchanged, change, or wait; do not execute it.
- Existing Notion Task 02 status and Notes updated and reread to confirm the saved state. Use `In progress` during validation; use `Done` only after the minimum criteria above are met. Do not label preparation complete as Task 02 complete.

## Notion Notes draft — not saved

The following records the supplied aggregate update and remaining documentation gaps, and can be used when the existing tracker is accessible. Preserve any actual findings already in its Notes; inspect before editing.

Readiness check for the existing entry: locate Task 02 by title, confirm its status supports `In progress` and `Done`, and confirm Notes can hold the conversation summaries and evidence references below. Reuse those fields; do not add a database, dashboard, automation, or new properties merely for this template. No readiness check or status/Notes change has been performed remotely in this session.

```text
Task 02: In progress — closure documentation pending.
User reports completing five target SEO/GEO agency conversations and
positive interest in the product concept.
Individual conversation results documented: 0/5.
Workflows, pains, outputs, objections, and price reactions: not supplied.
Concrete paid-pilot offer and outcome: not supplied; occurrence unknown.
Pending: five individual results and the actual paid-pilot test details.
Do not mark Done until the minimum validation criteria are documented.
Task 03 — Create the First Manual AI Visibility Report: not started.
```

When validation is completed, replace the preparation status with the actual completion date, numbered conversation summaries, repeated pains, repeated desired outputs, main objections, pricing signals, paid-pilot outcome, and the continue/modify/stop decision with proposed product changes. Link the supporting private records without copying sensitive raw artifacts into general-access Notes.

After the user supplies results, the final summary must report: conversation count; most common pain; most requested output; biggest objection; pricing signal; paid-pilot result; implications for the product; and whether Task 03 should proceed unchanged or be modified. Until then, stop at preparation and wait. No product implementation is authorized by this research document.
