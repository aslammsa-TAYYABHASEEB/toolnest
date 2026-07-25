export function canProcessJsonInBrowser() {
  return typeof window !== "undefined" && typeof Worker !== "undefined";
}

export function createJsonWorker() {
  return new Worker(
    new URL("./processor.worker.ts", import.meta.url),
    { type: "module", name: "toolnest-json-processor" },
  );
}
