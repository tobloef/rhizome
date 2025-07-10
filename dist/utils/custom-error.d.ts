export declare class CustomError extends Error {
    constructor(message?: string, extra?: {
        cause?: Error;
    });
}
