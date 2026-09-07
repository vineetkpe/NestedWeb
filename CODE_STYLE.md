# Code style

Prefer simple functions, explicit names, and direct control flow. Keep changes small enough to review. Run Prettier; do not argue about formatting. Follow existing file conventions and use `@/` for project-root imports when they improve clarity.

- Strict TypeScript with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. `unknown` enters from network, form, environment, or stored JSON; narrow before use. No `any`, suppression comments, or assertion chains as validation.
- Explicit domain types near their rules. Discriminated unions for success/partial/failure and job state. Optional means absent; use null only when domain meaning requires it. UTC ISO timestamps at boundaries, `timestamptz` in storage, visible time zones in UI.
- Name units (`durationMs`, `costMicrounits`, `inputTokens`); monetary accounting uses integer smallest units with explicit currency/price version, never floating-point balances.
- Separate raw payloads from normalized data. Version transformations; never overwrite evidence to fix a parser.
- Default to server components. Add `"use client"` only for browser interaction. No business calculations in JSX or SDK calls in React components.
- Validate required server configuration when its feature starts; don't require unused keys to render the static shell. Never put secret values in examples or diagnostics.
- Expected failures get typed results with safe codes. Unexpected failures retain a cause server-side without serializing it to the client. No empty catches that turn failed business operations into success.
- Comment the reason or constraint, not each line. Avoid speculative generics, god-services, repeated magic values, and catch-all utils. Extract components/helpers only when repetition or a real boundary justifies them.

ESLint rejects explicit `any`, TypeScript suppression directives, and `dangerouslySetInnerHTML`. This is a narrow guard, not proof against all injection or architectural violations. Review imports and data flow as well as lint output.
