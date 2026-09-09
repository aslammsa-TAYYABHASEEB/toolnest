import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const endpoint = "https://api.indexnow.org/indexnow";
const keyFileUrl = new URL("../public/indexnow-key.txt", import.meta.url);
const key = (await readFile(fileURLToPath(keyFileUrl), "utf8")).trim();
const rawInputs = process.argv.slice(2);
const siteArgument = rawInputs.find((value) => value.startsWith("--site="));
const configuredOrigin = siteArgument?.slice("--site=".length).trim()
  || process.env.NEXT_PUBLIC_SITE_URL?.trim();

if (!configuredOrigin) {
  throw new Error("Set NEXT_PUBLIC_SITE_URL to the deployed HTTPS origin before submitting URLs.");
}

const origin = new URL(configuredOrigin);
if (origin.protocol !== "https:" || origin.pathname !== "/" || origin.search || origin.hash) {
  throw new Error("NEXT_PUBLIC_SITE_URL must be an HTTPS origin without a path, query, or fragment.");
}

function canonicalUrl(value) {
  const url = new URL(value, origin);
  if (url.origin !== origin.origin) {
    throw new Error(`Refusing to submit a URL outside ${origin.origin}: ${url.href}`);
  }
  url.hash = "";
  return url.href.replace(/\/$/, url.pathname === "/" ? "/" : "");
}

async function urlsFromSitemap() {
  const response = await fetch(new URL("/sitemap.xml", origin));
  if (!response.ok) {
    throw new Error(`Could not read the deployed sitemap (${response.status}).`);
  }
  const xml = await response.text();
  return Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g), (match) => canonicalUrl(match[1]));
}

const inputs = rawInputs.filter((value) => !value.startsWith("--site="));
const urls = inputs.length === 0 || inputs.includes("--all")
  ? await urlsFromSitemap()
  : inputs.map(canonicalUrl);
const uniqueUrls = [...new Set(urls)];

if (uniqueUrls.length === 0) throw new Error("No URLs were provided or found in the sitemap.");
if (uniqueUrls.length > 10_000) throw new Error("IndexNow accepts at most 10,000 URLs per request.");

const response = await fetch(endpoint, {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({
    host: origin.host,
    key,
    keyLocation: new URL("/indexnow-key.txt", origin).href,
    urlList: uniqueUrls,
  }),
});

if (!response.ok) {
  const detail = (await response.text()).trim().slice(0, 500);
  throw new Error(`IndexNow returned ${response.status}${detail ? `: ${detail}` : ""}`);
}

console.log(`IndexNow accepted ${uniqueUrls.length} URL${uniqueUrls.length === 1 ? "" : "s"} (${response.status}).`);
