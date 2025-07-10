import { errorToString } from "./utils/error-to-string.js";
import { ResourceReevaluationError } from "./errors/resource-reevaluation-error.js";
import { assertExhaustive } from "./utils/assert-exhaustive.js";
export class Resource {
    static defaultOnErrorableError = logErrorableError;
    static defaultOnEvaluated = undefined;
    static defaultOnInvalidated = undefined;
    dependencies;
    dependents = new Set();
    evaluator;
    options = {
        errorables: [],
        dependentsInvalidateWhen: "invalidated",
    };
    error;
    internalStatus = "unevaluated";
    evaluationPromise;
    erroredDependencies = new Set();
    onEvaluatedCallbacks = new Set();
    onInvalidatedCallbacks = new Set();
    onErrorableErrorCallbacks = new Set();
    invalidationCallback;
    recentCallChain = [];
    constructor(evaluator, dependencies, options) {
        this.dependencies = dependencies ?? {};
        this.options = {
            ...this.options,
            ...options,
        };
        this.evaluator = evaluator;
        if (Resource.defaultOnEvaluated !== undefined) {
            this.onEvaluated(Resource.defaultOnEvaluated);
        }
        if (Resource.defaultOnErrorableError !== undefined) {
            this.onErrorableError(Resource.defaultOnErrorableError);
        }
        if (Resource.defaultOnInvalidated !== undefined) {
            this.onInvalidated(Resource.defaultOnInvalidated);
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
        await this.invalidationCallback?.();
        this.invalidationCallback = undefined;
        this.onEvaluatedCallbacks.clear();
        this.onErrorableErrorCallbacks.clear();
        this.onInvalidatedCallbacks.clear();
        this.dependents.clear();
        this.status = "destroyed";
        this.error = undefined;
    }
    invalidate(invalidationChain = []) {
        switch (this.status) {
            case "unevaluated":
            case "invalidated":
                // Nothing to do, already invalidated.
                break;
            case "evaluated":
            case "evaluating":
            case "errored":
                this.status = "invalidated";
                this.triggerOnInvalidated(invalidationChain);
                const newCallChain = [...invalidationChain, this];
                this.recentCallChain = newCallChain;
                if (this.options.dependentsInvalidateWhen === "invalidated") {
                    this.invalidateDependents(newCallChain);
                }
                break;
            case "destroyed":
                throw new Error(`Cannot invalidate resource ${this.constructor.name}, it has already been destroyed.`);
            default:
                assertExhaustive(this.status);
        }
    }
    invalidateDependents(callChain = [this]) {
        for (const dependent of this.dependents) {
            dependent.invalidate(callChain);
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
                case "invalidated":
                    this.evaluationPromise = this.createEvaluationPromise();
                    break;
            }
        }
        try {
            return await this.evaluationPromise;
        }
        catch (error) {
            const refreshError = new ResourceReevaluationError(error);
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
    onInvalidated(callback) {
        this.onInvalidatedCallbacks.add(callback);
        return () => {
            this.onInvalidatedCallbacks.delete(callback);
        };
    }
    triggerOnInvalidated(callChain) {
        for (const callback of this.onInvalidatedCallbacks) {
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
                await this.invalidationCallback?.();
                let result = await this.evaluator(dependencies);
                this.invalidationCallback = result.invalidate;
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
                    case "invalidated":
                        // It went back to an invalidated state, so we need to re-evaluate
                        result = await this.createEvaluationPromise();
                }
                resolve(result);
                this.triggerOnEvaluated(result.value);
            }
            catch (error) {
                reject(error);
                this.triggerOnEvaluated(new ResourceReevaluationError(error));
            }
            finally {
                if (this.options.dependentsInvalidateWhen === "reevaluated") {
                    this.invalidateDependents(this.recentCallChain);
                }
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
                const isAllowedToError = this.options.errorables?.includes(key);
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
function logErrorableError({ key, error, resource, }) {
    console.error(`Dependency "${key}" of ${resource.constructor.name} failed to load.`, "However, this dependency is errorable so the error will be ignored.\n\n", errorToString(error));
}
//# sourceMappingURL=resource.js.map