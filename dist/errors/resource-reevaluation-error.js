import { CustomError } from "../utils/custom-error.js";
export class ResourceReevaluationError extends CustomError {
    constructor(resource, error) {
        const message = `Failed to re-evaluate resource of type "${resource.constructor.name}".`;
        super(message, { cause: error });
    }
}
//# sourceMappingURL=resource-reevaluation-error.js.map