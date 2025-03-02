export function errorToString(error) {
    let result = "";
    if (error.stack) {
        result += error.stack;
    }
    else {
        result += `${error.constructor.name}: ${error.message}`;
    }
    if (error.cause !== undefined && error.cause !== null) {
        result += "\n\nCaused by:\n\n" + errorToString(error.cause);
    }
    return result;
}
//# sourceMappingURL=error-to-string.js.map