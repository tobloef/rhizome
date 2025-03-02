import { CustomError } from "./custom-error";
import type { ResourceNode } from "../resource-node.ts";

export class ResourceNodeRefreshError extends CustomError {
  constructor(
    resourceNode: ResourceNode<any, any>,
    error: Error,
  ) {
    const message = `Failed to refresh resource node of type "${resourceNode.constructor.name}".`;
    super(message, { cause: error });
  }
}