const assert = require("node:assert/strict");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");
const { PDFDocument, StandardFonts } = require("pdf-lib");

const root = path.join(__dirname, "..");
const port = 3127;
const baseUrl = `http://127.0.0.1:${port}`;

function waitForServer(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = async () => {
      try {
        const response = await fetch(baseUrl);
        if (response.ok) return resolve();
      } catch {}
      if (Date.now() >= deadline) return reject(new Error("Production server did not become ready"));
      setTimeout(attempt, 250);
    };
    void attempt();
  });
}

async function makePdf() {
  const document = await PDFDocument.create();
  const page = document.addPage([320, 220]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  page.drawText("ToolNest local PDF security test", { x: 24, y: 170, size: 16, font });
  return Buffer.from(await document.save());
}

async function installObservers(page, label, records) {
  await page.addInitScript(() => {
    window.__toolnestCspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      window.__toolnestCspViolations.push({
        blockedURI: event.blockedURI,
        directive: event.effectiveDirective,
        sourceFile: event.sourceFile,
      });
    });
  });
  page.on("request", (request) => {
    records.requests.push({
      label,
      method: request.method(),
      resourceType: request.resourceType(),
      url: request.url(),
      hasBody: Boolean(request.postData()),
    });
  });
  page.on("worker", (worker) => records.workers.push({ label, url: worker.url() }));
  page.on("console", (message) => {
    if (message.type() === "error") records.consoleErrors.push({ label, text: message.text() });
  });
  page.on("pageerror", (error) => records.pageErrors.push({ label, text: error.message }));
}

async function collectViolations(page, label, records) {
  const violations = await page.evaluate(() => window.__toolnestCspViolations ?? []);
  records.violations.push(...violations.map((violation) => ({ label, ...violation })));
}

(async () => {
  const nextBin = require.resolve("next/dist/bin/next");
  const server = spawn(process.execPath, [nextBin, "start", "-p", String(port)], {
    cwd: root,
    env: { ...process.env, NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let serverOutput = "";
  server.stdout.on("data", (chunk) => { serverOutput += chunk; });
  server.stderr.on("data", (chunk) => { serverOutput += chunk; });

  const records = { requests: [], workers: [], consoleErrors: [], pageErrors: [], violations: [] };
  let browser;
  try {
    await waitForServer();
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ acceptDownloads: true });
    const pdf = await makePdf();

    {
      const page = await context.newPage();
      await installObservers(page, "homepage", records);
      const response = await page.goto(baseUrl, { waitUntil: "networkidle" });
      assert(response, "homepage response must exist");
      const csp = response.headers()["content-security-policy-report-only"];
      assert(csp, "production response must include a report-only CSP");
      assert.equal(response.headers()["content-security-policy"], undefined, "CSP must not be enforced in staging");
      await page.getByRole("button", { name: /Theme:/ }).click();
      await page.locator("details.nav-dropdown summary").click();
      await page.getByLabel("Main navigation").getByRole("link", { name: "PDF Tools" }).click();
      await page.waitForURL("**/categories/pdf-tools");
      await collectViolations(page, "homepage", records);
      await page.close();
    }

    {
      const page = await context.newPage();
      await installObservers(page, "json", records);
      await page.goto(`${baseUrl}/tools/json-formatter`, { waitUntil: "networkidle" });
      await page.locator("#json-input").fill('{"tool":"ToolNest","local":true}');
      await page.getByRole("button", { name: "Format", exact: true }).click();
      await page.getByText("Valid JSON", { exact: true }).waitFor();
      await collectViolations(page, "json", records);
      await page.close();
    }

    {
      const page = await context.newPage();
      await installObservers(page, "qr", records);
      await page.goto(`${baseUrl}/tools/qr-code-generator`, { waitUntil: "networkidle" });
      await page.locator("#qr-text").fill("ToolNest CSP local QR test");
      await page.locator('img[src^="blob:"]').waitFor();
      await collectViolations(page, "qr", records);
      await page.close();
    }

    {
      const page = await context.newPage();
      await installObservers(page, "pdf", records);
      await page.goto(`${baseUrl}/tools/pdf-to-jpg`, { waitUntil: "networkidle" });
      await page.locator("#pdf-to-image-file").setInputFiles({
        name: "csp-local.pdf",
        mimeType: "application/pdf",
        buffer: pdf,
      });
      await page.getByRole("button", { name: "Convert pages" }).waitFor();
      await collectViolations(page, "pdf", records);
      await page.close();
    }

    {
      const page = await context.newPage();
      await installObservers(page, "image-ocr", records);
      await page.goto(`${baseUrl}/tools/image-to-text`, { waitUntil: "networkidle" });
      const dataUrl = await page.evaluate(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 900;
        canvas.height = 240;
        const context = canvas.getContext("2d");
        context.fillStyle = "white";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "black";
        context.font = "bold 72px Arial";
        context.fillText("TOOLNEST OCR TEST", 40, 145);
        return canvas.toDataURL("image/png");
      });
      await page.locator("#image-ocr-file").setInputFiles({
        name: "csp-ocr.png",
        mimeType: "image/png",
        buffer: Buffer.from(dataUrl.split(",")[1], "base64"),
      });
      await page.getByRole("button", { name: "Extract Text" }).click();
      await page.getByText(/Text extracted|No readable text was detected/).waitFor({ timeout: 120_000 });
      await collectViolations(page, "image-ocr", records);
      await page.close();
    }

    {
      const page = await context.newPage();
      await installObservers(page, "document-privacy", records);
      await page.goto(`${baseUrl}/tools/document-privacy`, { waitUntil: "networkidle" });
      await page.locator("#document-privacy-file").setInputFiles({
        name: "privacy-local.pdf",
        mimeType: "application/pdf",
        buffer: pdf,
      });
      await page.getByRole("button", { name: "Inspect PDF" }).click();
      await page.getByText(/Inspection complete:/).waitFor({ timeout: 60_000 });
      await collectViolations(page, "document-privacy", records);
      await page.close();
    }

    const remoteRequests = records.requests.filter(({ url }) => {
      const parsed = new URL(url);
      return parsed.origin !== baseUrl && !["blob:", "data:"].includes(parsed.protocol);
    });
    assert(remoteRequests.length > 0, "OCR must exercise its external language-data request");
    assert(remoteRequests.every(({ url }) => new URL(url).origin === "https://cdn.jsdelivr.net"),
      `unexpected external request(s): ${JSON.stringify(remoteRequests, null, 2)}`);
    assert(remoteRequests.every(({ method, hasBody }) => ["GET", "HEAD"].includes(method) && !hasBody),
      "external OCR requests must be body-free GET/HEAD requests");
    assert(records.workers.some(({ label }) => label === "json"),
      "JSON Formatter must start its browser worker");
    assert(records.requests.some(({ label, url }) => label === "pdf" && url.endsWith("/pdf.worker.min.mjs")),
      "PDF flow must load the same-origin PDF.js worker");
    assert(records.requests.some(({ label, url }) => label === "image-ocr" && url.endsWith("/tesseract/worker.min.js")),
      "Image OCR must load the same-origin Tesseract worker");
    assert(records.requests.some(({ label, url }) => label === "image-ocr" && url.includes("/tesseract/core/")),
      "Image OCR must load its same-origin Tesseract core");
    assert.equal(records.requests.some(({ label, url }) => label === "document-privacy" && new URL(url).origin === "https://cdn.jsdelivr.net"), false,
      "Document Privacy must not request OCR language data");
    assert.equal(records.requests.some(({ method }) => !["GET", "HEAD"].includes(method)), false,
      "tested local tools must not make upload/write network requests");
    assert.deepEqual(records.pageErrors, [], `page errors: ${JSON.stringify(records.pageErrors, null, 2)}`);
    assert.deepEqual(records.violations, [], `CSP violations: ${JSON.stringify(records.violations, null, 2)}`);
    const expectedOcrDiagnostics = /Invalid resolution 0 dpi|Too few characters\. Skipping this page/;
    const unexpectedConsoleErrors = records.consoleErrors.filter(({ text }) =>
      !/Content Security Policy/i.test(text) && !expectedOcrDiagnostics.test(text)
    );
    assert.deepEqual(unexpectedConsoleErrors, [], `console errors: ${JSON.stringify(unexpectedConsoleErrors, null, 2)}`);

    console.log("PASS: production CSP browser matrix");
    console.log(JSON.stringify({
      scenarios: ["homepage/nav/theme", "JSON worker", "QR blob preview", "PDF worker", "Image OCR", "Document Privacy"],
      externalOrigins: [...new Set(remoteRequests.map(({ url }) => new URL(url).origin))],
      cspViolations: records.violations.length,
      pageErrors: records.pageErrors.length,
      uploadRequests: records.requests.filter(({ method }) => !["GET", "HEAD"].includes(method)).length,
    }, null, 2));
  } catch (error) {
    console.error(error);
    console.error("Server output:", serverOutput);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})();
