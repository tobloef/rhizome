import type { AnyResource, DependencyMap, EmptyOptions, EvaluationResult, OnErrorableErrorCallback, OnEvaluatedCallback, OnMarkedStaleCallback, OnTeardownCallback, RemoveCallback, ResourceEvaluator, ResourceOptions, ResourcesFor, ResourceStatus, } from "./resource.types.ts";
import { errorToString } from "./utils/error-to-string.ts";
import { ResourceReevaluationError } from "./errors/resource-reevaluation-error.ts";
import { assertExhaustive } from "./utils/assert-exhaustive.ts";
import type { KeysOptional } from "./utils/keys-optional.ts";

export class Resource<
  Type,
  const Dependencies extends DependencyMap = {},
  const Options extends ResourceOptions<Dependencies> = EmptyOptions,
> {
  static defaultOnErrorableError?: OnErrorableErrorCallback = ({
    key,
    error,
    resource,
  }) => {
    console.error(
      `Dependency "${key}" of ${resource.constructor.name} failed to load.`,
      "However, this dependency is errorable so the error will be ignored.\n\n",
      errorToString(error)
    );
  };

  static defaultOnEvaluated?: OnEvaluatedCallback = undefined;

  dependencies: ResourcesFor<Dependencies>;
  dependents = new Set<AnyResource>();
  evaluator: ResourceEvaluator<Type, Dependencies, Options>;
  options: Options;
  error?: ResourceReevaluationError;

  private internalStatus: ResourceStatus = "unevaluated";
  private evaluationPromise?: Promise<EvaluationResult<Type>>;
  private erroredDependencies = new Set<keyof Dependencies>();
  private onEvaluatedCallbacks = new Set<OnEvaluatedCallback<Resource<Type, Dependencies, Options>>>();
  private onErrorableErrorCallbacks = new Set<OnErrorableErrorCallback<Resource<Type, Dependencies, Options>>>();
  private onMarkedStaleCallbacks = new Set<OnMarkedStaleCallback<Resource<Type, Dependencies, Options>>>();
  private onTeardownCallback?: OnTeardownCallback;

  constructor(
    evaluator: ResourceEvaluator<Type, {}, EmptyOptions>
  );

  constructor(
    evaluator: ResourceEvaluator<Type, Dependencies, EmptyOptions>,
    dependencies: ResourcesFor<Dependencies>,
  );

  constructor(
    evaluator: ResourceEvaluator<Type, Dependencies, Options>,
    dependencies: ResourcesFor<Dependencies>,
    options: Options,
  );

  constructor(
    evaluator: ResourceEvaluator<Type, Dependencies, Options>,
    dependencies?: ResourcesFor<Dependencies>,
    options?: Options,
  ) {
    this.dependencies = dependencies ?? {} as ResourcesFor<Dependencies>;
    this.options = options ?? { errorables: [] } as unknown as Options;
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
    this.onTeardownCallback?.call(this);
    this.onTeardownCallback = undefined;
    this.onEvaluatedCallbacks.clear();
    this.onErrorableErrorCallbacks.clear();
    this.onMarkedStaleCallbacks.clear();
    this.dependents.clear();
    this.status = "destroyed";
    this.error = undefined;
  }

  markStale(
    callChain: AnyResource[] = [],
  ): void {
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
        throw new Error(
          `Cannot mark resource ${this.constructor.name} as stale, it has already been destroyed.`
        );

      default:
        assertExhaustive(this.status);
    }
  }

  private markDependentsStale(
    callChain: AnyResource[] = [this],
  ): void {
    for (const dependent of this.dependents) {
      dependent.markStale(callChain);
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
        case "stale":
          this.evaluationPromise = this.createEvaluationPromise();
          break;
      }
    }

    try {
      return await this.evaluationPromise;
    } catch (error) {
      const refreshError = new ResourceReevaluationError(this, error);
      this.status = "errored";
      this.error = refreshError;
      throw refreshError;
    }
  }

  onEvaluated(
    callback: OnEvaluatedCallback<Resource<Type, Dependencies, Options>>,
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
    callback: OnErrorableErrorCallback<Resource<Type, Dependencies, Options>>,
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

  onMarkedStale(
    callback: OnMarkedStaleCallback<Resource<Type, Dependencies, Options>>,
  ): RemoveCallback {
    this.onMarkedStaleCallbacks.add(callback);

    return () => {
      this.onMarkedStaleCallbacks.delete(callback);
    };
  }

  private triggerOnMarkedStale(callChain: AnyResource[]): void {
    for (const callback of this.onMarkedStaleCallbacks) {
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

        await this.onTeardownCallback?.();
        let result = await this.evaluator(dependencies);
        this.onTeardownCallback = result.onTeardown;

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
          case "stale":
            // It went back to a stale state, so we need to re-evaluate
            result = await this.createEvaluationPromise();
        }

        resolve(result);

        this.triggerOnEvaluated(result.value);
      } catch (e) {
        reject(e);

        this.triggerOnEvaluated(new ResourceReevaluationError(this, e));
      }
    });
  }

  private async evaluateDependencies(): Promise<
    KeysOptional<Dependencies, Options["errorables"]>
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

        const isAllowedToError = this.options?.errorables?.includes(key as any);

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

    return dependencies as KeysOptional<Dependencies, Options["errorables"]>
  }
}