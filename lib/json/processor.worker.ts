/// <reference lib="webworker" />

import { processJson } from "@/lib/json/processor";
import type {
  JsonProcessRequest,
  JsonProcessResponse,
} from "@/lib/json/types";

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

workerScope.onmessage = (event: MessageEvent<JsonProcessRequest>) => {
  const { id, input, operation } = event.data;
  const response: JsonProcessResponse = processJson(id, input, operation);
  workerScope.postMessage(response);
};

export {};
