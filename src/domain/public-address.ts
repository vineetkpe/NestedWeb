import { BlockList, isIP } from "node:net";

// Conservative policy: all IANA special assignments, not just RFC1918.
// Sources and review date are recorded in SECURITY.md. Do not expose the lists.
const blockedV4 = new BlockList();
const ipv4Subnets: ReadonlyArray<readonly [string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.31.196.0", 24],
  ["192.52.193.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["192.175.48.0", 24],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];
for (const [address, prefix] of ipv4Subnets)
  blockedV4.addSubnet(address, prefix, "ipv4");
blockedV4.addAddress("168.63.129.16", "ipv4"); // Azure platform virtual IP.

const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
const blockedV6 = new BlockList();
const ipv6Subnets: ReadonlyArray<readonly [string, number]> = [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["2620:4f:8000::", 48],
  ["3fff::", 20],
];
for (const [address, prefix] of ipv6Subnets)
  blockedV6.addSubnet(address, prefix, "ipv6");

/** Pure address classification; DNS names, zone IDs and mapped IPv4 are denied. */
export function isPublicAddress(input: unknown): input is string {
  if (typeof input !== "string" || input.includes("%")) return false;
  const family = isIP(input);
  if (family === 4) return !blockedV4.check(input, "ipv4");
  return (
    family === 6 &&
    globalV6.check(input, "ipv6") &&
    !blockedV6.check(input, "ipv6")
  );
}
