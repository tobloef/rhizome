import { CustomError } from "../utils/custom-error.ts";
import type { AnyResource } from "../resource.types.ts";

export class ResourceReevaluationError extends CustomError {
  constructor(
    resourceNode: AnyResource,
    error: Error,
  ) {
    const message = `Failed to re-evaluate resource of type "${resourceNode.constructor.name}".`;
    super(message, { cause: error });
  }
}