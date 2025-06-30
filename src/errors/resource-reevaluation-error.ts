import { CustomError } from "../utils/custom-error.ts";
import type { AnyResource } from "../resource.types.ts";

export class ResourceReevaluationError extends CustomError {
  constructor(
    resource: AnyResource,
    error: Error,
  ) {
    const message = `Failed to re-evaluate resource of type "${resource.constructor.name}".`;
    super(message, { cause: error });
  }
}