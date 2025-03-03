import type { ResourceNode } from "./resource-node.ts";

export type DependencyMap = Record<string, unknown>;

export type ResourceNodeOptions<
  Dependencies extends DependencyMap | undefined
> = {
  errorables?: KeyOfOptionalDependency<Dependencies>[];
}

export type ResourceNodes<
  Dependencies extends DependencyMap | undefined
> = {
  [K in keyof Dependencies]: ResourceNode<Dependencies[K], any>
}

export type KeyOfOptionalDependency<T> = Keys<Optionals<T>>;

export type Optionals<T> = {
  [K in keyof T]: undefined extends T[K] ? K : never;
}

export type Keys<T> = T[keyof T];

export type ResourceNodeStatus = (
  | "uninitialized"
  | "loading"
  | "ready"
  | "stale"
  | "errored"
);