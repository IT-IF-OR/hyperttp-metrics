export interface MetricsOptions {
  /**
   * @ru Включить сбор метрик
   * @en Enable metrics collection
   */
  enabled?: boolean;

  /**
   * @ru Максимальное количество записей в истории.
   * @en Maximum number of entries in history.
   */
  maxHistory?: number;

  /**
   * @ru Время хранения метрик в миллисекундах.
   * @en Time to keep metrics in milliseconds.
   */
  ttl?: number;

  /**
   * @ru Глубина scope для circuit breaker: 1 = host + первый сегмент пути.
   * @en Scope depth for circuit breaker: 1 = host + first path segment.
   */
  scopeDepth?: number;

  /**
   * @ru Порог ошибки, после которого circuit breaker переходит в OPEN.
   * @en Failure score threshold that opens the circuit breaker.
   */
  failureThreshold?: number;

  /**
   * @ru Время охлаждения перед переходом в HALF_OPEN.
   * @en Cooldown time before switching to HALF_OPEN.
   */
  resetTimeout?: number;

  /**
   * @ru Порог "медленного" запроса в миллисекундах.
   * @en Slow request threshold in milliseconds.
   */
  slowRequestMs?: number;

  /**
   * @ru Веса ошибок для разных классов отказов.
   * @en Failure weights for different failure classes.
   */
  weights?: {
    timeout?: number;
    serverError?: number;
    rateLimit?: number;
    slowRequest?: number;
    other?: number;
  };
}

export type CircuitStateName = "CLOSED" | "OPEN" | "HALF_OPEN";

export type CircuitState = {
  state: CircuitStateName;
  failureScore: number;
  consecutiveFailures: number;
  lastFailureTime: number;
  lastTransitionTime: number;
  probeInFlight: boolean;
};

export interface MemoryUsageSnapshot {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
}

export interface RequestPerformanceProfile {
  wallClockStart: number;
  wallClockEnd: number;
  durationMs: number;
  cpu: {
    userMs: number;
    systemMs: number;
    totalMs: number;
    percent: number;
  };
  memory: {
    before: MemoryUsageSnapshot;
    after: MemoryUsageSnapshot;
    delta: MemoryUsageSnapshot;
  };
}
