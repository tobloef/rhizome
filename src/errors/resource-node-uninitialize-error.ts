import { CustomError } from "./custom-error.ts";
import type { ResourceNode } from "../resource-node.ts";

export class ResourceNodeUninitializeError extends CustomError {
  constructor(
    resourceNode: ResourceNode<any, any>,
    error: Error,
  ) {
    const message = `Failed to uninitialize resource node of type "${resourceNode.constructor.name}".`;
    super(message, { cause: error });
  }
}