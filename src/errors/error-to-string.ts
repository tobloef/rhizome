type ErrorLike = {
  message: string;
  stack?: string;
  cause?: ErrorLike;
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
    result += "\n\nCaused by:\n\n" + errorToString(error.cause);
  }

  return result;
}