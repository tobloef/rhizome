import { errorToString } from "./utils/error-to-string.js";
import { ResourceReevaluationError } from "./errors/resource-reevaluation-error.js";
import { assertExhaustive } from "./utils/assert-exhaustive.js";
export class Resource {
    static defaultOnErrorableError = ({ key, error, resource, }) => {
        console.error(`Dependency "${key}" of ${resource.constructor.name} failed to load.`, "However, this dependency is errorable so the error will be ignored.\n\n", errorToString(error));
    };
    static defaultOnEvaluated = undefined;
    dependencies;
    dependents = new Set();
    evaluator;
    options;
    error;
    internalStatus = "unevaluated";
    evaluationPromise;
    erroredDependencies = new Set();
    onEvaluatedCallbacks = new Set();
    onErrorableErrorCallbacks = new Set();
    onMarkedStaleCallbacks = new Set();
    onTeardownCallback;
    constructor(evaluator, dependencies, options) {
        this.dependencies = dependencies ?? {};
        this.options = options ?? { errorables: [] };
        this.evaluator = evaluator;
        if (Resource.defaultOnEvaluated !== undefined) {
            this.onEvaluated(Resource.defaultOnEvaluated);
        }
        if (Resource.defaultOnErrorableError !== undefined) {
            this.onErrorableError(Resource.defaultOnErrorableError);
        }
        for (const dependency of Object.values(this.dependencies)) {
            dependency.dependents.add(this);
        }
    }
    get status() {
        return this.internalStatus;
    }
    set status(value) {
        this.internalStatus = value;
        if (value !== "errored") {
            this.error = undefined;
        }
    }
    async destroy() {
        this.onTeardownCallback?.call(this);
        this.onTeardownCallback = undefined;
        this.onEvaluatedCallbacks.clear();
        this.onErrorableErrorCallbacks.clear();
        this.onMarkedStaleCallbacks.clear();
        this.dependents.clear();
        this.status = "destroyed";
        this.error = undefined;
    }
    markStale(callChain = []) {
        switch (this.status) {
            case "unevaluated":
            case "stale":
                // Nothing to do, already stale.
                break;
            case "evaluated":
            case "evaluating":
            case "errored":
                this.status = "stale";
                this.triggerOnMarkedStale(callChain);
                this.markDependentsStale([...callChain, this]);
                break;
            case "destroyed":
                throw new Error(`Cannot mark resource ${this.constructor.name} as stale, it has already been destroyed.`);
            default:
                assertExhaustive(this.status);
        }
    }
    markDependentsStale(callChain = [this]) {
        for (const dependent of this.dependents) {
            dependent.markStale(callChain);
        }
    }
    async evaluate() {
        if (this.evaluationPromise === undefined) {
            this.evaluationPromise = this.createEvaluationPromise();
        }
        else {
            switch (this.status) {
                case "evaluating":
                case "evaluated":
                    // We already have a value promise
                    break;
                case "errored":
                    throw this.error;
                case "unevaluated":
                case "stale":
                    this.evaluationPromise = this.createEvaluationPromise();
                    break;
            }
        }
        try {
            return await this.evaluationPromise;
        }
        catch (error) {
            const refreshError = new ResourceReevaluationError(this, error);
            this.status = "errored";
            this.error = refreshError;
            throw refreshError;
        }
    }
    onEvaluated(callback) {
        this.onEvaluatedCallbacks.add(callback);
        return () => {
            this.onEvaluatedCallbacks.delete(callback);
        };
    }
    triggerOnEvaluated(result) {
        for (const callback of this.onEvaluatedCallbacks) {
            callback({
                resource: this,
                result: result,
            });
        }
    }
    onErrorableError(callback) {
        this.onErrorableErrorCallbacks.add(callback);
        return () => {
            this.onErrorableErrorCallbacks.delete(callback);
        };
    }
    triggerOnErrorableError(key, error, dependency) {
        for (const callback of this.onErrorableErrorCallbacks) {
            callback({
                resource: this,
                error,
                dependency,
                key,
            });
        }
    }
    onMarkedStale(callback) {
        this.onMarkedStaleCallbacks.add(callback);
        return () => {
            this.onMarkedStaleCallbacks.delete(callback);
        };
    }
    triggerOnMarkedStale(callChain) {
        for (const callback of this.onMarkedStaleCallbacks) {
            callback({
                resource: this,
                callChain,
            });
        }
    }
    createEvaluationPromise() {
        return new Promise(async (resolve, reject) => {
            if (this.status === "destroyed") {
                throw new Error(`Cannot evaluate resource ${this.constructor.name}, it has already been destroyed.`);
            }
            this.status = "evaluating";
            try {
                const dependencies = await this.evaluateDependencies();
                await this.onTeardownCallback?.();
                let result = await this.evaluator(dependencies);
                this.onTeardownCallback = result.onTeardown;
                const newStatus = this.status;
                // Check if it was marked a new status while we were loading
                switch (newStatus) {
                    case "evaluating":
                        // No, we weren't, so we can set it to ready
                        this.status = "evaluated";
                        break;
                    case "errored":
                        // Well, this new value is working let's just go ahead with that
                        this.status = "evaluated";
                        break;
                    case "evaluated":
                        // Oh, it's already ready, so we can just resolve
                        break;
                    case "unevaluated":
                    case "stale":
                        // It went back to a stale state, so we need to re-evaluate
                        result = await this.createEvaluationPromise();
                }
                resolve(result);
                this.triggerOnEvaluated(result.value);
            }
            catch (e) {
                reject(e);
                this.triggerOnEvaluated(new ResourceReevaluationError(this, e));
            }
        });
    }
    async evaluateDependencies() {
        const dependencies = {};
        const dependencyKeys = (Object.keys(this.dependencies));
        const dependencyPromises = (dependencyKeys.map((key) => this.dependencies[key].evaluate()));
        const evaluationResults = (await Promise.allSettled(dependencyPromises));
        for (let i = 0; i < dependencyKeys.length; i++) {
            const result = evaluationResults[i];
            const key = dependencyKeys[i];
            if (result.status === "fulfilled") {
                dependencies[key] = result.value.value;
                this.erroredDependencies.delete(key);
            }
            else {
                if (this.erroredDependencies.has(key)) {
                    continue;
                }
                this.erroredDependencies.add(key);
                const isAllowedToError = this.options?.errorables?.includes(key);
                if (isAllowedToError) {
                    this.triggerOnErrorableError(key, result.reason, this.dependencies[key]);
                }
                else {
                    throw result.reason;
                }
            }
        }
        return dependencies;
    }
}
//# sourceMappingURL=resource.js.map