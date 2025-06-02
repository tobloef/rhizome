import { ResourceNodeRefreshError } from "./errors/resource-node-refresh-error.js";
import { errorToString } from "./errors/error-to-string.js";
import { ResourceNodeUninitializeError } from "./errors/resource-node-uninitialize-error.js";
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
export class ResourceNode {
    dependencyNodes;
    dependentNodes = new Set();
    error;
    options;
    #status = "uninitialized";
    #valuePromise;
    #erroredDependencies = new Set();
    #continuousEvaluationCount = 0;
    #onChangeCallbacks = new Set();
    static #MAX_CONTINUOUS_EVALUATION_COUNT = 2;
    constructor(dependencyNodes, options) {
        this.dependencyNodes = dependencyNodes;
        this.options = options;
        for (const key in dependencyNodes) {
            dependencyNodes[key]?.addDependent(this);
        }
    }
    get status() {
        return this.#status;
    }
    set status(value) {
        this.#status = value;
        if (value !== "errored") {
            this.error = undefined;
        }
        if (value === "ready") {
            this.#continuousEvaluationCount = 0;
        }
    }
    async destroy() {
        try {
            const dependencies = await this.#evaluateDependencies();
            await this.uninitialize?.(dependencies);
            this.status = "uninitialized";
        }
        catch (error) {
            const uninitializeError = new ResourceNodeUninitializeError(this, error);
            this.status = "errored";
            this.error = uninitializeError;
            throw uninitializeError;
        }
    }
    addDependent(dependent) {
        this.dependentNodes.add(dependent);
    }
    markStale(invalidators = []) {
        switch (this.status) {
            case "uninitialized":
            case "stale":
                // Nothing to do, already stale.
                break;
            case "ready":
            case "loading":
            case "errored":
                this.status = "stale";
                this.markDependentsStale([...invalidators, this]);
                break;
        }
    }
    markDependentsStale(invalidators = [this]) {
        for (const dependent of this.dependentNodes) {
            dependent.markStale(invalidators);
        }
    }
    async evaluate() {
        if (this.#valuePromise === undefined) {
            this.#valuePromise = this.#createValuePromise();
        }
        else {
            switch (this.status) {
                case "loading":
                case "ready":
                    // We already have a value promise
                    break;
                case "errored":
                    throw this.error;
                case "uninitialized":
                case "stale":
                    this.#valuePromise = this.#createValuePromise();
                    break;
            }
        }
        try {
            return await this.#valuePromise;
        }
        catch (error) {
            const refreshError = new ResourceNodeRefreshError(this, error);
            this.status = "errored";
            this.error = refreshError;
            throw refreshError;
        }
    }
    #createValuePromise() {
        return new Promise(async (resolve, reject) => {
            this.#status = "loading";
            try {
                const dependencies = await this.#evaluateDependencies();
                let result;
                if (this.status === "uninitialized") {
                    result = await this.initialize(dependencies);
                }
                else {
                    await this.uninitialize?.(dependencies);
                    result = await this.initialize(dependencies);
                }
                // Check if it was marked a new status while we were loading
                switch (this.status) {
                    case "loading":
                        // No, we weren't, so we can set it to ready
                        this.status = "ready";
                        break;
                    case "errored":
                        // Well, this new value is working let's just go ahead with that
                        this.status = "ready";
                        break;
                    case "ready":
                        // Oh, it's already ready, so we can just resolve
                        break;
                    case "uninitialized":
                    case "stale":
                        // It went back to a stale state, so we need to re-evaluate
                        this.#continuousEvaluationCount++;
                        if (this.#continuousEvaluationCount > ResourceNode.#MAX_CONTINUOUS_EVALUATION_COUNT) {
                            console.warn(`Resource ${this.constructor.name} was marked as stale while loading ` +
                                `${this.#continuousEvaluationCount} times in a row, which may indicate ` +
                                `a performance problem.`);
                        }
                        result = await this.#createValuePromise();
                }
                resolve(result);
                this.triggerOnChangeCallbacks(result);
            }
            catch (e) {
                reject(e);
                this.triggerOnChangeCallbacks(new ResourceNodeRefreshError(this, e));
            }
        });
    }
    async #evaluateDependencies() {
        const dependencies = {};
        const dependencyKeys = (Object.keys(this.dependencyNodes));
        const dependencyPromises = (dependencyKeys.map((key) => this.dependencyNodes[key].evaluate()));
        const evaluationResults = (await Promise.allSettled(dependencyPromises));
        for (let i = 0; i < dependencyKeys.length; i++) {
            const result = evaluationResults[i];
            const key = dependencyKeys[i];
            if (result.status === "fulfilled") {
                dependencies[key] = result.value;
                this.#erroredDependencies.delete(key);
            }
            else {
                if (this.#erroredDependencies.has(key)) {
                    continue;
                }
                this.#erroredDependencies.add(key);
                const isAllowedToError = this.options?.errorables?.includes(key);
                if (isAllowedToError) {
                    console.error(`Dependency "${String(key)}" of ${this.constructor.name} failed to load.`, "However, this dependency is allowed to error so the error will be ignored.\n\n", errorToString(result.reason));
                }
                else {
                    throw result.reason;
                }
            }
        }
        return dependencies;
    }
    onChange(callback) {
        this.#onChangeCallbacks.add(callback);
        return () => {
            this.#onChangeCallbacks.delete(callback);
        };
    }
    triggerOnChangeCallbacks(result) {
        for (const callback of this.#onChangeCallbacks) {
            callback(result);
        }
    }
}
//# sourceMappingURL=resource-node.js.map