import { CustomError } from "../utils/custom-error.ts";
import type { AnyResource } from "../resource.types.ts";
export declare class ResourceReevaluationError extends CustomError {
    constructor(resourceNode: AnyResource, error: Error);
}
