

declare var tf: any;

export const lerp = (a: number, b: number, t: number): number => a * (1 - t) + b * t;
export const fract = (n: number): number => n - Math.floor(n);
export const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(v, max));

export const tensorLerp = (a: any, b: any, t: number): any => { // a, b are tf.Tensor
    // This function must be called from within a tf.tidy block.
    // The previous implementation used its own tidy, which returned a kept tensor, causing a memory leak.
    return a.mul(1 - t).add(b.mul(t));
};
