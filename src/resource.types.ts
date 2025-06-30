import { Resource } from "./resource.ts";
import { ResourceReevaluationError } from "./errors/resource-reevaluation-error.ts";
import type { KeysOptional } from "./utils/keys-optional.ts";

export type AnyResource = Resource<any, any, any>;

export type ResourceStatus = (
  | "unevaluated"
  | "evaluating"
  | "evaluated"
  | "invalidated"
  | "errored"
  | "destroyed"
);

export type ResourceEvaluator<
  Type,
  Dependencies extends DependencyMap,
  Errorables extends DependencyKeys<Dependencies>,
> = (
  dependencies: KeysOptional<Dependencies, Errorables>
) => EvaluationResult<Type> | Promise<EvaluationResult<Type>>;

export type EvaluationResult<Type> = {
  value: Type,
  invalidate?: InvalidationCallback,
};

export type DependencyMap = Record<string, unknown>;

export type DependencyKeys<Dependencies> = (keyof Dependencies)[];

export type ResourcesFor<
  Dependencies extends DependencyMap
> = {
  [K in keyof Dependencies]: (
    Resource<Dependencies[K], any, any>
  );
};

export type ValueType<Res extends AnyResource> = (
  Res extends Resource<infer T, any, any> ? T : never
)

export type RemoveCallback = () => void;

export type OnEvaluatedCallback<
  Res extends AnyResource = AnyResource,
> = (params: {
  resource: Res;
  result: ValueType<Res> | ResourceReevaluationError;
}) => void;

export type OnErrorableErrorCallback<
  Res extends AnyResource = AnyResource,
> = (params: {
  resource: Res;
  error: Error;
  key: string;
  dependency: AnyResource;
}) => void;

export type OnInvalidatedCallback<
  Res extends AnyResource = AnyResource,
> = (params: {
  resource: Res;
  callChain: AnyResource[];
}) => void;

export type InvalidationCallback = () => Promise<void>;