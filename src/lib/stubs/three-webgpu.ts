/**
 * Stub for `three/webgpu`. three-globe imports it unconditionally but only uses it for the
 * heatmap layer's GPU compute, which The Network does not use. Aliasing it here keeps ~500 KB
 * (gzipped) of WebGPU renderer code out of the globe bundle.
 */
export class WebGPURenderer {
  constructor() {
    throw new Error("WebGPU renderer is not bundled in The Network");
  }
}
export class StorageInstancedBufferAttribute {
  constructor() {
    throw new Error("WebGPU storage attributes are not bundled in The Network");
  }
}
