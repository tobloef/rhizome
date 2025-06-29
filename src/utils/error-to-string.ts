type ErrorLike = {
  message: string;
  stack?: string;
  cause?: ErrorLike | unknown;
};

export function errorToString(
  error: ErrorLike
): string {
  let result = "";

  if (error.stack) {
    result += error.stack;
  } else {
    result += `${error.constructor.name}: ${error.message}`;
  }

  if (error.cause !== undefined && error.cause !== null) {
    const causeMessage = isErrorLike(error.cause)
      ? errorToString(error.cause)
      : String(error.cause);
    result += "\n\nCaused by:\n\n" + causeMessage;
  }

  return result;
}

function isErrorLike(value: unknown): value is ErrorLike {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value !== "object") {
    return false;
  }

  if (!("message" in value) || typeof (value as any).message !== "string") {
    return false;
  }

  if ("stack" in value && typeof (value as any).stack !== "string") {
    return false;
  }

  return true;
}