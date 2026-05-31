/**
 * A minimal generic object pool. Recycles instances to avoid per-frame
 * allocation / GC churn during gameplay. Reused for obstacles now and for
 * coins / power-ups in later phases.
 */
export class ObjectPool<T> {
  private readonly free: T[] = [];

  /**
   * @param factory Creates a fresh instance when the pool is empty.
   * @param resetFn Optional hook run when an item is released back to the pool.
   */
  constructor(
    private readonly factory: () => T,
    private readonly resetFn?: (item: T) => void,
  ) {}

  acquire(): T {
    return this.free.pop() ?? this.factory();
  }

  release(item: T): void {
    this.resetFn?.(item);
    this.free.push(item);
  }

  /** Number of idle instances currently held. */
  get available(): number {
    return this.free.length;
  }
}
