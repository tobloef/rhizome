import { CustomError } from "../utils/custom-error.js";
export class ResourceReevaluationError extends CustomError {
    constructor(cause) {
        const message = `Failed to re-evaluate resource.`;
        super(message, { cause: cause });
    }
}
//# sourceMappingURL=resource-reevaluation-error.js.map