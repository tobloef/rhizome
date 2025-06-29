import { type DependencyMap, type EmptyOptions, type OnChangeCallback, type RemoveOnChangeCallback, type ResourceCallback, type ResourceOptions, type ResourcesFor, type ResourceStatus } from "../index.ts";
import { ResourceRefreshError } from "./resource-refresh-error.ts";

export type Resource<
  Type = unknown,
  Dependencies extends DependencyMap = {},
  Options extends ResourceOptions<Dependencies> = EmptyOptions,
> = {
  callback: ResourceCallback<Type, Dependencies, Options>;
  dependencies: ResourcesFor<Dependencies>;
  dependents: Set<Resource>
  options: Options;
  markStale: () => void;
  markDependentsStale: () => void;
  evaluate: () => Promise<Type>;
  onChange: (callback: OnChangeCallback<Type>) => RemoveOnChangeCallback;
  status: ResourceStatus;
  error?: ResourceRefreshError;
};