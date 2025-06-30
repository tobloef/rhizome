/**
 * Throw this in the default case of a switch statement to ensure all cases are handled.
 * Intended purely as a compile-time check, the runtime code should never be reached.
 */
export declare function assertExhaustive(value: never): Error;
