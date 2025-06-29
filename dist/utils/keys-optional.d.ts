export type KeysOptional<Obj extends Record<string, unknown>, Keys extends (keyof Obj)[]> = {
    [K in keyof Obj]: K extends Keys[number] ? Obj[K] | undefined : Obj[K];
};
