![Rhizome](https://github.com/user-attachments/assets/08975f31-3647-4262-977f-1b7aab30d552)

### A small library for creating reactive resource trees 🌳

Rhizome is a small library for creating reactive trees of arbitrary resources. The basic idea is that when one resource updates, any other resource nodes that depend on it will also be updated. I use this for my WebGPU rendering engine to manage the lifecycles of all the various GPU resources.

## Usage

### Defining Resources

A Rhizome `Resource` is essentially a wrapper around a function that create values of a given type. Rhizome calls such a function an "evaluator" function.

```ts
const numberResource = new Resource(
    () => ({ value: Math.random() })
);
```

### Evaluating Resources

Resources can be "evaluated" to get their inner value. This will run their evaluator function passed in at creation.

Evaluation is done lazily and the result is cached until it is invalidated. Evaluating our `numberResource` from above multiple times in a row will therefore give the same result, despite the evaluator function returning a random number.

```ts
const number1 = await numberResource.evaluate();
const number2 = await numberResource.evaluate();
console.log(number1 === number2); // true
```

### Invalidating Resources

Resources can be invalidated, which will cause their next evaluation to re-trigger the evaluator function.

```ts
const number1 = await numberResource.evaluate();
numberResource.invalidate();
const number2 = await numberResource.evaluate();
console.log(number1 === number2); // false
```

### Resource Dependencies

Resources can depend on each other. When a resource with dependencies is evaluated, it will also evaluate its children if they are unevaluated or invalidated.

```ts
const stringResource = new Resource(
    ({ number }) => ({ value: `The number is: ${number}` }),
    { number: numberResource },
);
```

Notice how the resource takes a map of its dependencies as the second argument. The evaluator function will then automatically be passed the _evaluated_ version of these dependencies, with the same keys as the original map.

When a resource is invalidated, it will also automatically invalidate its dependents.

```ts
const string1 = await stringResource.evaluate();
numberResource.invalidate(); // Notice: Not the string resource
const string2 = await stringResource.evaluate();
console.log(string1 === string2); // false
```

### Teardown Function
A resource can define a "teardown" function which will be called just before the resource is re-evaluated. This is useful for destroying old resources, such as textures, etc.

```ts
const textureResource = new Resource(() => {
    const value = createTexture();
    const onTeardown = () => value.destroy();
    return { value, onTeardown };
});
```

### Error Handling

If a resource's evaluator function throws an error, the resource will enter an `errored` state. If the resource is a dependency of another resource being evaluated, this error will by bubble up through the hierarchy.

```ts
const numberResource = new Resource(
    () => { throw new Error("Yikes!"); }
);

const stringResource = new Resource(
    ({ number }) => ({ value: `The number is: ${number}` }),
    { number: numberResource },
);

try {
    // This will throw due to the dependency's evaluator throwing.
    await stringResource.evaluate();
catch (error) {
    // The error contains the whole chain of errors using the the `cause` property.
    console.error(error);
}
```

Optionally, resources can specify a list of dependencies which are allowed to error. When one of these dependencies error, the evaluator will still be called but `undefined` will be passed instead of the dependency's evaluated result:

```ts
const numberResource = new Resource(
    () => { throw new Error("Yikes!"); }
);

const stringResource = new Resource(
    ({ number }) => {
        if (number === undefined) {
            return { value: `Sorry, no number for now...` };
        }
        return { value: `The number is: ${number}` };
    },
    { number: numberResource },
    { errorables: "number" },
);
```

### Asynchronous Evaluators

Evaluator functions can be async.

```ts
const resource = new Resource(async () => {
    const value = await fetchSomeObject();
    return { value };
});
```

If a resource is invalidated while an existing async evaluation is underway, a new evaluation will be started and both calls will return the result of this new evaluation once completed.

While this ensures that invalid resources are never used, you must also therefore make sure that resources are not continuously being invalidated before they can finish evaluation.

## Real-life use case

This example defines two resource types related to WebGPU. One is for a `GPUDevice` and one of for a `GPUTexture`. This `GPUDevice` can be "lost" due to various reasons, like browser resource management or GPU driver updates, after which all resources created for that device must be recreated for a new one.

So in the example below it's set up so that when the device is lost, the resource node will be marked as stale (which will in turn mark its dependents, such as the texture resource, as stale as well). Then, the next time the texture resource is evaluated, it will first re-initialize the device resource and then re-initialize the texture resource.

```ts
import { ResourceNode, type ResourceNodes } from "@tobloef/rhizome";

export class DeviceResource extends ResourceNode<GPUDevice, {}> {
  #device?: GPUDevice;

  async initialize(): Promise<GPUDevice> {
    const gpu = navigator.gpu;

    if (!gpu) {
      throw new Error("WebGPU not supported. No GPU found on navigator.");
    }

    const adapter = await gpu.requestAdapter({
      powerPreference: "high-performance",
    });

    if (!adapter) {
      throw new Error("WebGPU not supported. No adapter.");
    }

    this.#device = await adapter.requestDevice();

    this.#device.lost.then(() => {
      console.warn("GPU Device was lost, refreshing.");

      // Mark the device resource as stale, so it'll be updated next time it's evaluated
      this.markStale();
    });

    return this.#device;
  }

  // Will be called before the resource is re-initialized
  async uninitialize() {
    if (this.#device === undefined) {
      return;
    }

    this.#device.destroy();
  }
}

// We're dependent on having a GPU device to create the texture on
type TextureDependencies = {
  device: GPUDevice,
}

class TextureResource extends ResourceNode<GPUTexture, TextureDependencies> {
  #descriptor: GPUTextureDescriptor;
  #texture: GPUTexture;

  constructor(
    descriptor: GPUTextureDescriptor,
    dependencies: ResourceNodes<TextureDependencies>,
  ) {
    super(dependencies);

    this.#descriptor = descriptor;
  }

  override async initialize(
    dependencies: Dependencies,
  ): Promise<GPUTexture> {
    const { device } = dependencies;

    this.#texture = device.createTexture(this.#descriptor);

    return this.#texture
  }

  // Will be called before the resource is re-initialized
  override async uninitialize() {
    if (this.#texture === undefined) {
      return;
    }

    this.#texture.destroy();
  }
}
```

```ts
const textResource = new Resource({
  evaluator: ({ ... }) => {
    const texture = createTexture(...);
    
    return {
      value: texture,
      onInvalidate: () => destroyTexture(texture),
    };
  },
  dependencies: { ... }
});
```