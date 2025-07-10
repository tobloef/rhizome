import { CustomError } from "../utils/custom-error.ts";
import type { AnyResource } from "../resource.types.ts";

export class ResourceReevaluationError extends CustomError {
  constructor(
    cause?: Error,
  ) {
    const message = `Failed to re-evaluate resource.`;
    super(message, { cause: cause });
  }
}