![Rhizome](https://github.com/user-attachments/assets/08975f31-3647-4262-977f-1b7aab30d552)

### A small library for creating reactive resource trees 🌳

Rhizome is a small library for creating reactive trees of arbitrary resources. The basic idea is that when one resource node updates, any other resource nodes that depend on it will also be updated. I use this for my WebGPU rendering engine to manage the lifecycles of all the various GPU resources.

## Examples

### Minimal tree

```ts
import { ResourceNode, type ResourceNodes } from "@tobloef/rhizome";

// Define a new type of `number` resource with no dependencies.
class A extends ResourceNode<number, {}> {
  constructor(
    private value: number
  ) {}

  // Must override `initialize` with a method that returns the resource's value.
  override async initialize() {
    return this.value;
  }

  updateValue(newValue: number) {
    this.value = newValue;
    // Marking all resource nodes depending on this one as stale,
    // since this one's value just got updated.
    this.markDependentsStale();
  }
}

// Define a new type of `string` resource with a `number` resource as a dependency.
class B extends ResourceNode<string, { a: number }> {
  override async initialize({ a }) {
    return `The number is: ${a}`;
  }
}

// Instantiate the resource tree
const a = new A(123);
const b = new B({ a });

const bValue = await b.evaluate(); // "The number is: 123"

a.updateValue(456);

const newBValue = await b.evaluate(); // "The number is: 456"
```

### Real-life use case

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
      this.markStale(); // Provided by the ResourceNode base class
    });

    return this.#device;
  }

  async uninitialize() {
    if (this.#device !== undefined) {
      this.#device.destroy();
    }
  }
}

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

  override async uninitialize() {
    if (this.#texture === undefined) {
      return;
    }

    this.#texture.destroy();
  }
}
```
