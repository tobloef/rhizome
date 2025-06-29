import { Resource } from "./resource.ts";
import { ResourceReevaluationError } from "./errors/resource-reevaluation-error.ts";
import type { KeysOptional } from "./utils/keys-optional.ts";
export type AnyResource = Resource<any, any, any>;
export type ResourceStatus = ("unevaluated" | "evaluating" | "evaluated" | "stale" | "errored" | "destroyed");
export type ResourceEvaluator<Type, Dependencies extends DependencyMap, Options extends ResourceOptions<Dependencies>> = (dependencies: KeysOptional<Dependencies, Options["errorables"]>) => Promise<EvaluationResult<Type>>;
export type EvaluationResult<Type> = {
    value: Type;
    onTeardown?: OnTeardownCallback;
};
export type DependencyMap = Record<string, unknown>;
export type DependencyKeys<Dependencies> = (keyof Dependencies)[];
export type ResourceOptions<Dependencies extends DependencyMap> = {
    errorables: DependencyKeys<Dependencies>;
};
export type ResourcesFor<Dependencies extends DependencyMap> = {
    [K in keyof Dependencies]: (Resource<Dependencies[K], any, any>);
};
export type EmptyOptions = {
    errorables: [];
};
export type ValueType<Res extends AnyResource> = (Res extends Resource<infer T, any, any> ? T : never);
export type RemoveCallback = () => void;
export type OnEvaluatedCallback<Res extends AnyResource = AnyResource> = (params: {
    resource: Res;
    result: ValueType<Res> | ResourceReevaluationError;
}) => void;
export type OnErrorableErrorCallback<Res extends AnyResource = AnyResource> = (params: {
    resource: Res;
    error: Error;
    key: string;
    dependency: AnyResource;
}) => void;
export type OnMarkedStaleCallback<Res extends AnyResource = AnyResource> = (params: {
    resource: Res;
    callChain: AnyResource[];
}) => void;
export type OnTeardownCallback = () => Promise<void>;
