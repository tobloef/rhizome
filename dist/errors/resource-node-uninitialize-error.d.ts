import { CustomError } from "./custom-error.ts";
import type { ResourceNode } from "../resource-node.ts";
export declare class ResourceNodeUninitializeError extends CustomError {
    constructor(resourceNode: ResourceNode<any, any>, error: Error);
}
