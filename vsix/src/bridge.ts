import { BridgeRequest, BridgeResponse, ErrorCode } from "./protocol";

export interface RangeLike {
  start: {
    line: number;
    character: number;
  };
  end: {
    line: number;
    character: number;
  };
}

export function createOkResponse(
  instanceId: string,
  id: string,
  result: unknown,
  documentDirty?: boolean
): BridgeResponse {
  return {
    id,
    ok: true,
    meta: {
      instanceId,
      documentDirty
    },
    result
  };
}

export function createErrorResponse(
  instanceId: string,
  id: string,
  code: ErrorCode,
  message: string,
  retryable: boolean
): BridgeResponse {
  return {
    id,
    ok: false,
    meta: {
      instanceId
    },
    error: {
      code,
      message,
      retryable
    }
  };
}

export function parseRequestLine(instanceId: string, line: string): BridgeRequest | BridgeResponse {
  let request: BridgeRequest;

  try {
    request = JSON.parse(line) as BridgeRequest;
  } catch {
    return createErrorResponse(instanceId, "unknown", "INVALID_REQUEST", "Malformed JSON request", false);
  }

  if (!request.id || !request.method) {
    return createErrorResponse(
      instanceId,
      request.id ?? "unknown",
      "INVALID_REQUEST",
      "Missing id or method",
      false
    );
  }

  return request;
}

export function serializeRange(range: RangeLike) {
  return {
    start: {
      line: range.start.line,
      character: range.start.character
    },
    end: {
      line: range.end.line,
      character: range.end.character
    }
  };
}
