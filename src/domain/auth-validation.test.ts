import assert from "node:assert/strict";
import test from "node:test";

import {
  validateEmail,
  validatePassword,
  validateAgencyName,
  validateSafeRedirect,
} from "./auth-validation.ts";

test("validateEmail accepts valid email formats and normalizes case", () => {
  assert.equal(validateEmail("user@example.com"), "user@example.com");
  assert.equal(
    validateEmail("  Agency.Lead@Domain.CO  "),
    "agency.lead@domain.co",
  );
  assert.equal(
    validateEmail("test+tag@sub.domain.org"),
    "test+tag@sub.domain.org",
  );
});

test("validateEmail rejects invalid or malicious email inputs", () => {
  assert.equal(validateEmail(""), null);
  assert.equal(validateEmail("plainaddress"), null);
  assert.equal(validateEmail("@missinguser.com"), null);
  assert.equal(validateEmail("user@.com"), null);
  assert.equal(validateEmail(null), null);
  assert.equal(validateEmail(undefined), null);
  assert.equal(validateEmail(12345), null);
});

test("validatePassword enforces length bounds", () => {
  assert.equal(validatePassword("validPassword123"), "validPassword123");
  assert.equal(validatePassword("short"), null); // < 8 chars
  assert.equal(validatePassword(""), null);
  assert.equal(validatePassword(null), null);
});

test("validateAgencyName checks length bounds", () => {
  assert.equal(validateAgencyName("Apex SEO Group"), "Apex SEO Group");
  assert.equal(validateAgencyName("  Pinnacle Media  "), "Pinnacle Media");
  assert.equal(validateAgencyName("A"), null); // < 2 chars
  assert.equal(validateAgencyName(""), null);
});

test("validateSafeRedirect allows valid internal relative paths", () => {
  assert.equal(validateSafeRedirect("/workspace"), "/workspace");
  assert.equal(
    validateSafeRedirect("/report?projectId=123"),
    "/report?projectId=123",
  );
  assert.equal(validateSafeRedirect("/admin"), "/admin");
});

test("validateSafeRedirect prevents open redirect attacks", () => {
  // Protocol-relative URLs
  assert.equal(validateSafeRedirect("//attacker.com"), "/workspace");
  assert.equal(validateSafeRedirect("///evil.com"), "/workspace");

  // Absolute URLs with external schemes
  assert.equal(validateSafeRedirect("https://attacker.com"), "/workspace");
  assert.equal(validateSafeRedirect("http://evil.com/phish"), "/workspace");
  assert.equal(validateSafeRedirect("javascript:alert(1)"), "/workspace");
  assert.equal(validateSafeRedirect("data:text/html,..."), "/workspace");

  // Backslash bypass attempts
  assert.equal(validateSafeRedirect("/\\attacker.com"), "/workspace");

  // Embedded colon bypasses
  assert.equal(validateSafeRedirect("/foo:bar"), "/workspace");

  // Non-string inputs
  assert.equal(validateSafeRedirect(null), "/workspace");
  assert.equal(validateSafeRedirect(undefined), "/workspace");
  assert.equal(validateSafeRedirect({}), "/workspace");
});
