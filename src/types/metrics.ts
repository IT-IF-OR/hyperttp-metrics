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

export interface RequestMetrics {
  /**
   * @ru Время начала запроса (timestamp)
   * @en Request start time (timestamp)
   */
  startTime: number;

  /**
   * @ru Время окончания запроса (timestamp)
   * @en Request end time (timestamp)
   */
  endTime: number;

  /**
   * @ru Длительность запроса (мс)
   * @en Request duration (ms)
   */
  duration: number;

  /**
   * @ru HTTP статус код ответа
   * @en HTTP status code of response
   */
  statusCode?: number;

  /**
   * @ru Количество полученных байт
   * @en Bytes received
   */
  bytesReceived: number;

  /**
   * @ru Количество отправленных байт
   * @en Bytes sent
   */
  bytesSent: number;

  /**
   * @ru Количество повторных попыток
   * @en Number of retries performed
   */
  retries: number;

  /**
   * @ru Ответ из кэша
   * @en Response served from cache
   */
  cached: boolean;

  /**
   * @ru URL запроса
   * @en Request URL
   */
  url: string;

  /**
   * @ru HTTP метод запроса
   * @en HTTP method
   */
  method: string;

  /**
   * @ru Хэш тела запроса (для кэширования)
   * @en Request body hash (for caching)
   */
  bodyHash?: string;

  stages?: {
    serializationMs?: number;
    networkMs?: number;
    parsingMs?: number;
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
