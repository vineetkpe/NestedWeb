import {
  normalizeWebsite,
  type Website,
  type WebsiteErrorCode,
} from "../domain/website.ts";
import { isPublicAddress } from "../domain/public-address.ts";

export type WebsiteAddressResolver = (
  hostname: string,
  signal: AbortSignal,
) => Promise<unknown>;
const targetBrand: unique symbol = Symbol("validated website target");
const issuedTargets = new WeakSet<object>();
export type ValidatedWebsiteTarget = Website & {
  readonly addresses: readonly string[];
  readonly [targetBrand]: true;
};

/** Proves in-process provenance and immutability, not DNS freshness or authority. */
export function isValidatedWebsiteTarget(
  value: unknown,
): value is ValidatedWebsiteTarget {
  return (
    typeof value === "object" && value !== null && issuedTargets.has(value)
  );
}

export type WebsiteTargetResult =
  | { ok: true; value: ValidatedWebsiteTarget }
  | {
      ok: false;
      code:
        | WebsiteErrorCode
        | "dns_failed"
        | "dns_timeout"
        | "cancelled"
        | "invalid_dns_response"
        | "unsafe_address";
    };

/** DNS snapshot only. A future transport must pin these addresses when dialing. */
export async function prepareWebsiteTarget(
  input: unknown,
  resolveAddresses: WebsiteAddressResolver,
  signal?: AbortSignal,
): Promise<WebsiteTargetResult> {
  const website = normalizeWebsite(input);
  if (!website.ok) return website;
  if (signal?.aborted) return { ok: false, code: "cancelled" };

  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort = () => {};
  const interrupted = new Promise<never>((_resolve, reject) => {
    onAbort = () => {
      reject(new Error("DNS interrupted"));
      controller.abort();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => {
      timedOut = true;
      onAbort();
    }, 3000);
  });

  try {
    const response: unknown = await Promise.race([
      // Convert synchronous throws to rejections before constructing the race,
      // so a simultaneous cancellation always has a rejection handler too.
      (async () =>
        resolveAddresses(website.value.hostname, controller.signal))(),
      interrupted,
    ]);
    if (signal?.aborted) return { ok: false, code: "cancelled" };
    if (timedOut) return { ok: false, code: "dns_timeout" };
    if (
      !Array.isArray(response) ||
      response.length === 0 ||
      response.length > 64
    ) {
      return { ok: false, code: "invalid_dns_response" };
    }
    const addresses: string[] = [];
    for (const address of response) {
      if (!isPublicAddress(address))
        return { ok: false, code: "unsafe_address" };
      addresses.push(address);
    }
    const value: ValidatedWebsiteTarget = {
      ...website.value,
      addresses: Object.freeze([...new Set(addresses)]),
      [targetBrand]: true,
    };
    Object.defineProperty(value, targetBrand, { enumerable: false });
    Object.freeze(value);
    issuedTargets.add(value);
    return { ok: true, value };
  } catch {
    return {
      ok: false,
      code: signal?.aborted
        ? "cancelled"
        : timedOut
          ? "dns_timeout"
          : "dns_failed",
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
    controller.abort();
  }
}
