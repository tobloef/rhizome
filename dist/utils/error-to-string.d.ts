type ErrorLike = {
    message: string;
    stack?: string;
    cause?: ErrorLike | unknown;
};
export declare function errorToString(error: ErrorLike): string;
export {};
