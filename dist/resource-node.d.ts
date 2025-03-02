import type { DependencyMap, DependencyResourceNodes, ResourceNodeOptions, ResourceNodeStatus } from "./resource-node.types.ts";
import { ResourceNodeRefreshError } from "./errors/resource-node-refresh-error.ts";
/**
 * A node representing a resource of a specific type.
 *
 * Resource nodes will automatically refresh when one of their dependencies
 * gets refreshed, allowing you to build up a reactive graph of resources.
 *
 * @template ResourceType The raw type of the resource. This is the type that
 * will be resolved by the node and its dependents when the resource is
 * refreshed.
 *
 * @template Dependencies Optionally, a map of all the dependencies of the
 * resource. Resource nodes with matching resource types will need to provided
 * when instantiating a resource node that requires dependencies.
 *
 * @example Defining a resource node without dependencies:
 * class SomeResource extends ResourceNode<string, {}> {
 *   constructor() {
 *     super({});
 *   }
 * }
 *
 * @example Defining a resource node with dependencies:
 * class SomeResource extends ResourceNode<number, { a: number }> {
 *   constructor(dependencies: { a: number }) {
 *     super(dependencies);
 *   }
 * }
 *
 * A resource node also takes a number of options as a optional second
 * argument.
 *
 * @example Defining a resource node with some dependencies being allowed to error:
 * // Note how `b` must be optional since it is allowed to error.
 * class SomeResource extends ResourceNode<boolean, { a: number, b?: number }> {
 *   constructor(dependencies: { a: number, b: number }) {
 *     super(dependencies, { errorables: ["b"] });
 *   }
 * }
 */
export declare abstract class ResourceNode<ResourceType, Dependencies extends DependencyMap> {
    #private;
    dependencyNodes: DependencyResourceNodes<Dependencies>;
    dependentNodes: Set<ResourceNode<any, any>>;
    error?: ResourceNodeRefreshError;
    options?: ResourceNodeOptions<Dependencies>;
    constructor(dependencyNodes: DependencyResourceNodes<Dependencies>, options?: ResourceNodeOptions<Dependencies>);
    get status(): ResourceNodeStatus;
    set status(value: ResourceNodeStatus);
    protected abstract initialize(dependencies: Dependencies): Promise<ResourceType>;
    protected abstract reload?(dependencies: Dependencies): Promise<ResourceType>;
    protected abstract cleanup(dependencies: Dependencies): Promise<void>;
    uninitialize(): Promise<void>;
    addDependent(dependent: ResourceNode<any, any>): void;
    markStale(invalidators: ResourceNode<any, any>[]): void;
    markDependentsStale(invalidators?: ResourceNode<any, any>[]): void;
    evaluate(): Promise<ResourceType>;
}
