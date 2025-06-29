import { CustomError } from "../errors/custom-error.ts";
import type { ResourceNode } from "../resource-node.ts";

export class ResourceRefreshError extends CustomError {
  constructor(
    resourceNode: ResourceNode<any, any>,
    error: Error,
  ) {
    const message = `Failed to refresh resource of type "${resourceNode.constructor.name}".`;
    super(message, { cause: error });
  }
}