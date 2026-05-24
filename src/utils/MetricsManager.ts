import { LRUCache } from "lru-cache";
import type {
  CircuitState,
  MetricsOptions,
  RequestMetrics,
} from "../types/metrics.js";

export class MetricsManager {
  private readonly history: LRUCache<string, RequestMetrics>;
  private readonly hostStates: LRUCache<string, CircuitState>;

  private readonly scopeDepth: number;
  private readonly failureThreshold: number;
  private readonly resetTimeout: number;
  private readonly slowRequestMs: number;
  private readonly weights: Required<NonNullable<MetricsOptions["weights"]>>;
  private readonly latestByUrl = new Map<string, RequestMetrics>();

  private _totalBytesAccumulator = 0;
  private _recordId = 0;

  constructor(config?: MetricsOptions) {
    this.history = new LRUCache({
      max: config?.maxHistory ?? 1000,
      ttl: config?.ttl ?? 1000 * 60 * 60,
      ttlAutopurge: true,
    });

    this.hostStates = new LRUCache({
      max: 500,
      ttl: 1000 * 60 * 60 * 24,
    });

    this.scopeDepth = Math.max(1, config?.scopeDepth ?? 1);
    this.failureThreshold = Math.max(1, config?.failureThreshold ?? 5);
    this.resetTimeout = Math.max(1, config?.resetTimeout ?? 30_000);
    this.slowRequestMs = Math.max(1, config?.slowRequestMs ?? 5_000);
    this.weights = {
      timeout: config?.weights?.timeout ?? 2,
      serverError: config?.weights?.serverError ?? 1,
      rateLimit: config?.weights?.rateLimit ?? 1.5,
      slowRequest: config?.weights?.slowRequest ?? 0.5,
      other: config?.weights?.other ?? 1,
    };
  }

  private getScope(url: string): string {
    try {
      const u = new URL(url);
      const segments = u.pathname.split("/").filter(Boolean);
      const scopedPath = segments.slice(0, this.scopeDepth).join("/");
      return scopedPath ? `${u.host}/${scopedPath}` : u.host;
    } catch {
      return "unknown";
    }
  }

  private getOrCreateState(scope: string): CircuitState {
    let state = this.hostStates.get(scope);

    if (!state) {
      state = {
        state: "CLOSED",
        failureScore: 0,
        consecutiveFailures: 0,
        lastFailureTime: 0,
        lastTransitionTime: Date.now(),
        probeInFlight: false,
      };
      this.hostStates.set(scope, state);
    }

    return state;
  }

  isCircuitOpen(url: string): boolean {
    const scope = this.getScope(url);
    const state = this.getOrCreateState(scope);

    if (state.state === "CLOSED") {
      return false;
    }

    if (state.state === "OPEN") {
      const elapsed = Date.now() - state.lastTransitionTime;

      if (elapsed < this.resetTimeout) {
        return true;
      }

      state.state = "HALF_OPEN";
      state.probeInFlight = false;
      state.lastTransitionTime = Date.now();
    }

    if (state.state === "HALF_OPEN") {
      if (state.probeInFlight) {
        return true;
      }

      state.probeInFlight = true;
      return false;
    }

    return false;
  }

  record(metrics: RequestMetrics & { cacheHit?: boolean }): void {
    this.storeMetrics(metrics);
    this.latestByUrl.set(metrics.url, metrics);
    this.updateCircuit(metrics);
  }

  get(key: string): RequestMetrics | undefined {
    const exact = this.history.get(key);
    if (exact) return exact;

    return this.latestByUrl.get(key);
  }

  getAll(): RequestMetrics[] {
    return Array.from(this.history.values());
  }

  recordBytes(bytes: number): void {
    this._totalBytesAccumulator += Math.max(0, bytes);
  }

  getSummary() {
    const all = this.getAll();
    const total = all.length;
    if (total === 0) return null;

    let successful = 0;
    let totalDuration = 0;
    let maxDuration = 0;
    let totalSerialization = 0;
    let totalNetwork = 0;

    const durations: number[] = new Array(total);

    for (let i = 0; i < total; i++) {
      const m = all[i];
      const status = m.statusCode ?? 0;

      if (status >= 100 && status < 400) {
        successful++;
      }

      totalDuration += m.duration;
      if (m.duration > maxDuration) {
        maxDuration = m.duration;
      }

      durations[i] = m.duration;
      totalSerialization += m.stages?.serializationMs ?? 0;
      totalNetwork += m.stages?.networkMs ?? 0;
    }

    durations.sort((a, b) => a - b);

    return {
      totalRequests: total,
      successRate: (successful / total) * 100,
      avgDurationMs: Math.round(totalDuration / total),
      totalBytesReceived: this._totalBytesAccumulator,
      errorCount: total - successful,
      maxDurationMs: maxDuration,
      p99DurationMs: this.percentileSorted(durations, 99),
      openCircuits: this.getOpenCircuitCount(),
      bottlenecks: {
        serialization: (totalSerialization / total).toFixed(2) + "ms",
        network: (totalNetwork / total).toFixed(2) + "ms",
      },
    };
  }

  clear(): void {
    this.history.clear();
    this.hostStates.clear();
    this.latestByUrl.clear();
    this._totalBytesAccumulator = 0;
    this._recordId = 0;
  }

  private storeMetrics(metrics: RequestMetrics): void {
    const key = `${metrics.method}:${metrics.url}:${Date.now()}:${this._recordId++}`;
    this.history.set(key, metrics);

    if (this._recordId > 1_000_000_000) {
      this._recordId = 0;
    }
  }

  private updateCircuit(metrics: RequestMetrics): void {
    const scope = this.getScope(metrics.url);
    const state = this.getOrCreateState(scope);

    const failureWeight = this.getFailureWeight(metrics);

    if (failureWeight > 0) {
      state.failureScore += failureWeight;
      state.consecutiveFailures += 1;
      state.lastFailureTime = Date.now();

      if (
        state.state === "HALF_OPEN" ||
        state.failureScore >= this.failureThreshold
      ) {
        state.state = "OPEN";
        state.probeInFlight = false;
        state.lastTransitionTime = Date.now();
      }

      this.hostStates.set(scope, state);
      return;
    }

    state.failureScore = 0;
    state.consecutiveFailures = 0;

    if (state.state === "HALF_OPEN" || state.state === "OPEN") {
      state.state = "CLOSED";
      state.probeInFlight = false;
      state.lastTransitionTime = Date.now();
    }

    this.hostStates.set(scope, state);
  }

  private getFailureWeight(metrics: RequestMetrics): number {
    const status = metrics.statusCode ?? 0;

    if (status === 0) return this.weights.timeout;
    if (status === 429) return this.weights.rateLimit;
    if (status >= 500) return this.weights.serverError;
    if (metrics.duration >= this.slowRequestMs) return this.weights.slowRequest;
    if (status >= 400) return this.weights.other;

    return 0;
  }

  private percentileSorted(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;

    const rank = (p / 100) * (sorted.length - 1);
    const low = Math.floor(rank);
    const high = Math.ceil(rank);

    if (low === high) return sorted[low];

    const weight = rank - low;
    return Math.round(sorted[low] * (1 - weight) + sorted[high] * weight);
  }

  private getOpenCircuitCount(): number {
    let count = 0;
    for (const state of this.hostStates.values()) {
      if (state.state === "OPEN") count++;
    }
    return count;
  }
}
