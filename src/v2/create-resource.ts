import type { Resource } from "./resource.ts";
import type { DependencyMap, EmptyOptions, ResourceCallback, ResourceOptions, ResourcesFor } from "../index.ts";

export function createResource<
  Type
>(
  callback: ResourceCallback<Type, {}, EmptyOptions>,
): Resource<Type>;

export function createResource<
  Type,
  const Dependencies extends DependencyMap
>(
  callback: ResourceCallback<Type, Dependencies, EmptyOptions>,
  dependencies: ResourcesFor<Dependencies>,
): Resource<Type, Dependencies>;

export function createResource<
  Type,
  const Dependencies extends DependencyMap,
  const Options extends ResourceOptions<Dependencies>
>(
  callback: ResourceCallback<Type, Dependencies, Options>,
  dependencies: ResourcesFor<Dependencies>,
  options: Options,
): Resource<Type, Dependencies, Options>;

export function createResource<
  Type,
  const Dependencies extends DependencyMap,
  const Options extends ResourceOptions<Dependencies>,
>(
  callback: ResourceCallback<Type, Dependencies, Options>,
  dependencies?: ResourcesFor<Dependencies>,
  options?: Options,
): Resource<Type, Dependencies, Options> {
  if (dependencies === undefined) {
    dependencies = {} as ResourcesFor<Dependencies>;
  }

  if (options === undefined) {
    options = { errorables: [] } as unknown as Options;
  }

  const dependents = new Set<Resource>();

  const resource: Resource<Type, Dependencies, Options> = {
    callback,
    options,
    dependencies,
    dependents,
    evaluate,
    markDependentsStale,
    markStale,
    onChange,
    status: "uninitialized",
  };

  for (const dependency of Object.values(dependencies)) {
    dependency.dependents.add(resource);
  }

  return resource;
}