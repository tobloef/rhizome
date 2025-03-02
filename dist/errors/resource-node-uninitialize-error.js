import { CustomError } from "./custom-error";
export class ResourceNodeUninitializeError extends CustomError {
    constructor(resourceNode, error) {
        const message = `Failed to uninitialize resource node of type "${resourceNode.constructor.name}".`;
        super(message, { cause: error });
    }
}
//# sourceMappingURL=resource-node-uninitialize-error.js.map