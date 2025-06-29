import type { Resource } from "./v2/resource.ts";
import { ResourceRefreshError } from "./v2/resource-refresh-error.ts";
import type { KeysOptional } from "./v2/utils/keys-optional.ts";

export type ResourceStatus = (
  | "uninitialized"
  | "loading"
  | "ready"
  | "stale"
  | "errored"
);

export type DependencyMap = Record<string, unknown>;
export type DependencyKeys<Dependencies> = (keyof Dependencies)[];

export type ResourceCallback<
  Type,
  Dependencies extends DependencyMap,
  Options extends ResourceOptions<Dependencies>,
> = (
  dependencies: KeysOptional<Dependencies, Options["errorables"]>
) => Type;

export type ResourceOptions<
  Dependencies extends DependencyMap,
> = {
  errorables: DependencyKeys<Dependencies>;
};

export type EmptyOptions = { errorables: [] };

export type ResourcesFor<
  Dependencies extends DependencyMap
> = {
  [K in keyof Dependencies]: (
    Resource<Dependencies[K], any, any>
  );
}

export type OnChangeCallback<Type> = (
  result: Type | ResourceRefreshError
) => void;

export type RemoveOnChangeCallback = () => void;


