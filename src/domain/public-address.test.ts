import assert from "node:assert/strict";
import { test } from "node:test";
import { isPublicAddress } from "./public-address.ts";

const blocked = [
  "0.0.0.0",
  "0.255.255.255",
  "10.0.0.0",
  "10.255.255.255",
  "100.64.0.0",
  "100.127.255.255",
  "127.0.0.0",
  "127.255.255.255",
  "169.254.0.0",
  "169.254.255.255",
  "172.16.0.0",
  "172.31.255.255",
  "192.0.0.0",
  "192.0.0.255",
  "192.0.2.0",
  "192.0.2.255",
  "192.31.196.0",
  "192.31.196.255",
  "192.52.193.0",
  "192.52.193.255",
  "192.88.99.0",
  "192.88.99.255",
  "192.168.0.0",
  "192.168.255.255",
  "192.175.48.0",
  "192.175.48.255",
  "198.18.0.0",
  "198.19.255.255",
  "198.51.100.0",
  "198.51.100.255",
  "203.0.113.0",
  "203.0.113.255",
  "224.0.0.0",
  "239.255.255.255",
  "240.0.0.0",
  "255.255.255.255",
  "168.63.129.16",
  "::",
  "::1",
  "::ffff:127.0.0.1",
  "::ffff:8.8.8.8",
  "::127.0.0.1",
  "64:ff9b::a00:1",
  "64:ff9b:1::1",
  "100::1",
  "100:0:0:1::1",
  "2001::1",
  "2001:1ff:ffff:ffff:ffff:ffff:ffff:ffff",
  "2001:db8::",
  "2001:db8:ffff:ffff:ffff:ffff:ffff:ffff",
  "2002:7f00:1::",
  "2002:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
  "2620:4f:8000::1",
  "3fff::",
  "3fff:fff:ffff:ffff:ffff:ffff:ffff:ffff",
  "5f00::1",
  "fc00::1",
  "fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
  "fe80::1",
  "fec0::1",
  "ff02::1",
  "fe80::1%eth0",
  "2606:4700::1%eth0",
  "0177.0.0.1",
  "127.1",
  "0x7f000001",
  "2130706433",
  "8.8.8.8 ",
  "[2606:4700:4700::1111]",
  "not-an-ip",
  "",
];

for (const address of blocked) {
  test(`rejects special or malformed address ${address}`, () => {
    assert.equal(isPublicAddress(address), false);
  });
}

for (const address of [
  "1.1.1.1",
  "8.8.8.8",
  "100.63.255.255",
  "100.128.0.0",
  "172.15.255.255",
  "172.32.0.0",
  "192.167.255.255",
  "192.169.0.0",
  "198.17.255.255",
  "198.20.0.0",
  "223.255.255.255",
  "2606:4700:4700::1111",
  "2606:4700:4700:0:0:0:0:1111",
  "2001:4860:4860::8888",
  "2001:200::1",
  "3ffe:ffff::1",
]) {
  test(`accepts ordinary public address ${address}`, () => {
    assert.equal(isPublicAddress(address), true);
  });
}

test("non-string DNS address data fails closed", () => {
  for (const input of [null, undefined, 1234, {}, []]) {
    assert.equal(isPublicAddress(input), false);
  }
});
