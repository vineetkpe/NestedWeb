import { Resolver } from "node:dns/promises";
import type { WebsiteAddressResolver } from "../application/website-target.ts";

function absentFamily(error: unknown): string[] {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENODATA"
  ) {
    return [];
  }
  throw error;
}

/** Node-only DNS adapter; call through prepareWebsiteTarget for bounds and policy. */
export const resolveWebsiteAddresses: WebsiteAddressResolver = async (
  hostname,
  signal,
) => {
  signal.throwIfAborted();
  const resolver = new Resolver({ timeout: 1000, tries: 1 });
  const cancel = () => resolver.cancel();
  signal.addEventListener("abort", cancel, { once: true });
  try {
    // Absolute DNS name avoids search-suffix expansion. Query both families;
    // a failure in either family must never hide a potentially private answer.
    const [ipv4, ipv6] = await Promise.all([
      resolver.resolve4(`${hostname}.`).catch(absentFamily),
      resolver.resolve6(`${hostname}.`).catch(absentFamily),
    ]);
    return [...ipv4, ...ipv6];
  } finally {
    signal.removeEventListener("abort", cancel);
    resolver.cancel();
  }
};
