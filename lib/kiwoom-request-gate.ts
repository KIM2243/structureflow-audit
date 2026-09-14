// All quotes, chart pages and retries share one start-time budget per account.
export class RequestGate {
  private tail: Promise<void> = Promise.resolve();
  private nextAt = 0;
  private intervalMs: number;
  constructor(intervalMs: number) { this.intervalMs = intervalMs; }

  defer(ms: number) {
    this.nextAt = Math.max(this.nextAt, Date.now() + Math.max(0, ms));
  }

  wait(signal?: AbortSignal): Promise<void> {
    const turn = this.tail.then(async () => {
      signal?.throwIfAborted();
      while (this.nextAt > Date.now()) {
        await new Promise<void>((resolve, reject) => {
          const abort = () => { clearTimeout(timer); reject(signal?.reason); };
          const timer = setTimeout(() => {
            signal?.removeEventListener('abort', abort);
            resolve();
          }, this.nextAt - Date.now());
          signal?.addEventListener('abort', abort, { once: true });
        });
        signal?.throwIfAborted();
      }
      this.nextAt = Date.now() + this.intervalMs;
    });
    this.tail = turn.catch(() => undefined);
    return turn;
  }
}
