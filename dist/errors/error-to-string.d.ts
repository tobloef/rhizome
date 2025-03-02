type ErrorLike = {
    message: string;
    stack?: string;
    cause?: ErrorLike;
};
export declare function errorToString(error: ErrorLike): string;
export {};
