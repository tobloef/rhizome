export class CustomError extends Error {
    constructor(message, extra) {
        super(message, extra);
        this.name = this.constructor.name;
    }
}
//# sourceMappingURL=custom-error.js.map