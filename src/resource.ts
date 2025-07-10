import type {
  AnyResource,
  DependencyKeys,
  DependencyMap,
  EvaluationResult,
  OnErrorableErrorCallback,
  OnEvaluatedCallback,
  OnInvalidatedCallback,
  InvalidationCallback,
  RemoveCallback,
  ResourceEvaluator,
  ResourcesFor,
  ResourceStatus,
} from "./resource.types.ts";
import { errorToString } from "./utils/error-to-string.ts";
import { ResourceReevaluationError } from "./errors/resource-reevaluation-error.ts";
import { assertExhaustive } from "./utils/assert-exhaustive.ts";
import type { KeysOptional } from "./utils/keys-optional.ts";

export class Resource<
  Type,
  const Dependencies extends DependencyMap = {},
  const Errorables extends DependencyKeys<Dependencies> = [],
> {
  static defaultOnErrorableError?: OnErrorableErrorCallback = logErrorableError;
  static defaultOnEvaluated?: OnEvaluatedCallback = undefined;
  static defaultOnInvalidated?: OnInvalidatedCallback = undefined;

  dependencies: ResourcesFor<Dependencies>;
  dependents = new Set<AnyResource>();
  evaluator: ResourceEvaluator<Type, Dependencies, Errorables>;
  options: {
    errorables?: Errorables;
    dependentsInvalidatedWhen?: "invalidated" | "reevaluated";
  } = {
    errorables: [] as unknown as Errorables,
    dependentsInvalidatedWhen: "invalidated",
  }
  error?: ResourceReevaluationError;

  private internalStatus: ResourceStatus = "unevaluated";
  private evaluationPromise?: Promise<EvaluationResult<Type>>;
  private erroredDependencies = new Set<keyof Dependencies>();
  private onEvaluatedCallbacks = new Set<OnEvaluatedCallback<Resource<Type, Dependencies, Errorables>>>();
  private onInvalidatedCallbacks = new Set<OnInvalidatedCallback<Resource<Type, Dependencies, Errorables>>>();
  private onErrorableErrorCallbacks = new Set<OnErrorableErrorCallback<Resource<Type, Dependencies, Errorables>>>();
  private invalidationCallback?: InvalidationCallback;
  private recentCallChain: AnyResource[] = [];

  constructor(
    evaluator: ResourceEvaluator<Type, {}, []>
  );

  constructor(
    evaluator: ResourceEvaluator<Type, Dependencies, []>,
    dependencies: ResourcesFor<Dependencies>,
  );

  constructor(
    evaluator: ResourceEvaluator<Type, Dependencies, Errorables>,
    dependencies: ResourcesFor<Dependencies>,
    options: {
      errorables?: Errorables;
      dependentsInvalidatedWhen?: "invalidated" | "reevaluated";
    }
  );

  constructor(
    evaluator: ResourceEvaluator<Type, Dependencies, Errorables>,
    dependencies?: ResourcesFor<Dependencies>,
    options?: {
      errorables?: Errorables;
      dependsInvalidatedWhen?: "invalidated" | "reevaluated";
    }
  ) {
    this.dependencies = dependencies ?? {} as ResourcesFor<Dependencies>;
    this.options = {
      ...this.options,
      ...options,
    }
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

  get status(): ResourceStatus {
    return this.internalStatus;
  }

  private set status(value: ResourceStatus) {
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

  invalidate(
    invalidationChain: AnyResource[] = [],
  ): void {
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
        if (this.options.dependentsInvalidatedWhen === "invalidated") {
          this.invalidateDependents(newCallChain);
        }
        break;

      case "destroyed":
        throw new Error(
          `Cannot invalidate resource ${this.constructor.name}, it has already been destroyed.`
        );

      default:
        assertExhaustive(this.status);
    }
  }

  private invalidateDependents(
    callChain: AnyResource[] = [this],
  ): void {
    for (const dependent of this.dependents) {
      dependent.invalidate(callChain);
    }
  }

  async evaluate(): Promise<EvaluationResult<Type>> {
    if (this.evaluationPromise === undefined) {
      this.evaluationPromise = this.createEvaluationPromise();
    } else {
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
    } catch (error) {
      const refreshError = new ResourceReevaluationError(error);
      this.status = "errored";
      this.error = refreshError;
      throw refreshError;
    }
  }

  onEvaluated(
    callback: OnEvaluatedCallback<Resource<Type, Dependencies, Errorables>>,
  ): RemoveCallback {
    this.onEvaluatedCallbacks.add(callback);

    return () => {
      this.onEvaluatedCallbacks.delete(callback);
    };
  }

  private triggerOnEvaluated(
    result: Type | ResourceReevaluationError,
  ): void {
    for (const callback of this.onEvaluatedCallbacks) {
      callback({
        resource: this,
        result: result,
      });
    }
  }

  onErrorableError(
    callback: OnErrorableErrorCallback<Resource<Type, Dependencies, Errorables>>,
  ): RemoveCallback {
    this.onErrorableErrorCallbacks.add(callback);

    return () => {
      this.onErrorableErrorCallbacks.delete(callback);
    };
  }

  private triggerOnErrorableError(
    key: string,
    error: Error,
    dependency: AnyResource,
  ): void {
    for (const callback of this.onErrorableErrorCallbacks) {
      callback({
        resource: this,
        error,
        dependency,
        key,
      });
    }
  }

  onInvalidated(
    callback: OnInvalidatedCallback<Resource<Type, Dependencies, Errorables>>,
  ): RemoveCallback {
    this.onInvalidatedCallbacks.add(callback);

    return () => {
      this.onInvalidatedCallbacks.delete(callback);
    };
  }

  private triggerOnInvalidated(callChain: AnyResource[]): void {
    for (const callback of this.onInvalidatedCallbacks) {
      callback({
        resource: this,
        callChain,
      });
    }
  }

  private createEvaluationPromise(): Promise<EvaluationResult<Type>> {
    return new Promise(async (resolve, reject) => {
      if (this.status === "destroyed") {
        throw new Error(
          `Cannot evaluate resource ${this.constructor.name}, it has already been destroyed.`
        );
      }

      this.status = "evaluating";

      try {
        const dependencies = await this.evaluateDependencies();

        await this.invalidationCallback?.();
        let result = await this.evaluator(dependencies);
        this.invalidationCallback = result.invalidate;

        const newStatus = this.status as ResourceStatus;

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
      } catch (error) {
        reject(error);

        this.triggerOnEvaluated(new ResourceReevaluationError(error));
      } finally {
        if (this.options.dependentsInvalidatedWhen === "reevaluated") {
          this.invalidateDependents(this.recentCallChain);
        }
      }
    });
  }

  private async evaluateDependencies(): Promise<
    KeysOptional<Dependencies, Errorables>
  > {
    const dependencies: Partial<Dependencies> = {};

    const dependencyKeys: Array<keyof Dependencies> = (
      Object.keys(this.dependencies)
    );

    const dependencyPromises = (
      dependencyKeys.map((key) => this.dependencies[key].evaluate())
    );

    const evaluationResults = (
      await Promise.allSettled(dependencyPromises)
    );

    for (let i = 0; i < dependencyKeys.length; i++) {
      const result = evaluationResults[i]!;
      const key = dependencyKeys[i]!;

      if (result.status === "fulfilled") {
        dependencies[key] = result.value.value;
        this.erroredDependencies.delete(key);
      } else {
        if (this.erroredDependencies.has(key)) {
          continue;
        }

        this.erroredDependencies.add(key);

        const isAllowedToError = this.options.errorables?.includes(key as any);

        if (isAllowedToError) {
          this.triggerOnErrorableError(
            key as string,
            result.reason as Error,
            this.dependencies[key],
          );
        } else {
          throw result.reason;
        }
      }
    }

    return dependencies as KeysOptional<Dependencies, Errorables>
  }
}

type OnErrorableErrorCallbackParams = Parameters<OnErrorableErrorCallback>[0];

function logErrorableError({
  key,
  error,
  resource,
}: OnErrorableErrorCallbackParams) {
  console.error(
    `Dependency "${key}" of ${resource.constructor.name} failed to load.`,
    "However, this dependency is errorable so the error will be ignored.\n\n",
    errorToString(error)
  );
}