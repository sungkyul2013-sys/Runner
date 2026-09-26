// three.js r186 always passes `swizzle: 'rgba'` (the identity) in GPUTextureViewDescriptor. Browsers that shipped
// WebGPU before the string form of `texture-component-swizzle` was specified (e.g. Chromium 141) reject the
// descriptor with a TypeError, which aborts every frame. Dropping the identity swizzle is semantically a no-op,
// so this shim only restores compatibility and never changes rendering.
type CreateView = (descriptor?: Record<string, unknown>) => unknown;

export function installWebGPUCompat(): void {
  const ctor = (globalThis as unknown as { GPUTexture?: { prototype: { createView: CreateView } } }).GPUTexture;
  if (!ctor) return;
  const proto = ctor.prototype;
  const original = proto.createView;
  if ((original as CreateView & { __apexCompat?: boolean }).__apexCompat) return;
  const patched: CreateView & { __apexCompat?: boolean } = function (this: unknown, descriptor) {
    if (descriptor && descriptor.swizzle === 'rgba') {
      const { swizzle: _identity, ...rest } = descriptor;
      return original.call(this, rest);
    }
    return original.call(this, descriptor);
  };
  patched.__apexCompat = true;
  proto.createView = patched;
}
