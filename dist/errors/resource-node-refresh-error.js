import { CustomError } from "./custom-error.js";
export class ResourceNodeRefreshError extends CustomError {
    constructor(resourceNode, error) {
        const message = `Failed to refresh resource node of type "${resourceNode.constructor.name}".`;
        super(message, { cause: error });
    }
}
//# sourceMappingURL=resource-node-refresh-error.js.map