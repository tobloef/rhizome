import { CustomError } from "../utils/custom-error.js";
export class ResourceReevaluationError extends CustomError {
    constructor(resourceNode, error) {
        const message = `Failed to re-evaluate resource of type "${resourceNode.constructor.name}".`;
        super(message, { cause: error });
    }
}
//# sourceMappingURL=resource-reevaluation-error.js.map