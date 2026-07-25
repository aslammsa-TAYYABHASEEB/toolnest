export type JsonOperation = "format" | "minify" | "validate";

export type JsonParseError = {
  message: string;
  position: number | null;
  line: number | null;
  column: number | null;
};

export type JsonProcessRequest = {
  id: number;
  input: string;
  operation: JsonOperation;
};

export type JsonProcessSuccess = {
  id: number;
  ok: true;
  operation: JsonOperation;
  output: string;
  rootType: string;
};

export type JsonProcessFailure = {
  id: number;
  ok: false;
  operation: JsonOperation;
  error: JsonParseError;
};

export type JsonProcessResponse = JsonProcessSuccess | JsonProcessFailure;
