const assert = require("node:assert/strict");

require("./pdf-word-loader.cjs");

const { contentSecurityPolicyReportOnly, default: nextConfig } = require("../next.config.ts");

function parsePolicy(value) {
  return new Map(value.split(";").map((directive) => {
    const [name, ...sources] = directive.trim().split(/\s+/);
    return [name, sources];
  }));
}

(async () => {
  const rules = await nextConfig.headers();
  const headers = rules.flatMap((rule) => rule.headers);
  const reportOnly = headers.filter((header) => header.key.toLowerCase() === "content-security-policy-report-only");
  const enforced = headers.filter((header) => header.key.toLowerCase() === "content-security-policy");

  assert.equal(reportOnly.length, 1, "exactly one report-only CSP header must be configured");
  assert.equal(enforced.length, 0, "the staged policy must not be enforced yet");
  assert.equal(reportOnly[0].value, contentSecurityPolicyReportOnly);

  const policy = parsePolicy(contentSecurityPolicyReportOnly);
  assert.deepEqual(policy.get("default-src"), ["'self'"]);
  assert.deepEqual(policy.get("base-uri"), ["'self'"]);
  assert.deepEqual(policy.get("object-src"), ["'none'"]);
  assert.deepEqual(policy.get("frame-ancestors"), ["'none'"]);
  assert.deepEqual(policy.get("form-action"), ["'self'"]);
  assert.deepEqual(policy.get("img-src"), ["'self'", "blob:", "data:"]);
  assert.deepEqual(policy.get("font-src"), ["'self'"]);
  assert.deepEqual(policy.get("worker-src"), ["'self'", "blob:"]);
  assert.deepEqual(policy.get("connect-src"), ["'self'", "https://cdn.jsdelivr.net"]);
  assert.deepEqual(policy.get("script-src"), ["'self'", "'unsafe-inline'"]);
  assert.deepEqual(policy.get("script-src-attr"), ["'none'"]);
  assert.deepEqual(policy.get("style-src"), ["'self'"]);
  assert.deepEqual(policy.get("style-src-attr"), ["'unsafe-inline'"]);
  assert.deepEqual(policy.get("manifest-src"), ["'self'"]);

  assert.equal(contentSecurityPolicyReportOnly.includes("*"), false, "CSP must not contain wildcards");
  const allSources = [...policy.values()].flat();
  assert.equal(allSources.includes("https:"), false, "CSP must not allow the whole HTTPS scheme");
  assert.equal(contentSecurityPolicyReportOnly.includes("'unsafe-eval'"), false, "CSP must not allow unsafe-eval");

  console.log("PASS: staged CSP is report-only, deterministic, and limited to verified runtime sources");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
