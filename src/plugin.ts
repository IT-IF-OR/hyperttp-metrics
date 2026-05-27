import type {
  HyperPlugin,
  InternalRequest,
  HttpClientOptions,
  HttpResponse,
  RequestMetrics,
  IHyperCore,
  PluginContext,
} from "@hyperttp/types";
import { MetricsManager } from "./utils/MetricsManager.js";
import type {
  MetaWithTimings,
  MetricsOptions,
  ResponseWithCacheFlags,
} from "./types/metrics.js";

declare module "@hyperttp/types" {
  interface HyperttpPluginsExtension {
    metrics?: MetricsOptions & { enabled?: boolean };
  }

  interface IHyperCore {
    getMetrics?: (key: string) => RequestMetrics | RequestMetrics[] | undefined;
    getAllMetrics?: () => RequestMetrics[];
    getMetricsSummary?: () => ReturnType<MetricsManager["getSummary"]>;
    getStats?: () => ReturnType<MetricsManager["getSummary"]>;
  }

  interface PluginContext {
    metrics?: MetricsManager;
  }
}

interface InflightTiming {
  wallClockStart: number;
  hrStart: number;
}

/**
 * @ru Плагин сквозного мониторинга метрик производительности и защиты сетевой инфраструктуры (Circuit Breaker).
 * @en Full-scale request performance metrics monitoring and infrastructure protection (Circuit Breaker) plugin.
 * @param options - Custom configuration parameters to override global metrics settings.
 * @returns HyperPlugin object instance.
 */
export function withMetrics(options?: Partial<MetricsOptions>): HyperPlugin {
  let metrics: MetricsManager;

  /**
   * @private
   * @ru Карта сопоставления запросов с метками времени их старта для вычисления задержек.
   * @en Map pairing requests with their corresponding start timestamps to evaluate internal latencies.
   */
  const timingMap = new WeakMap<InternalRequest, InflightTiming>();

  return {
    name: "hyperttp-metrics",

    /**
     * @ru Проверяет активацию плагина сбора метрик на основе переданной конфигурации.
     * @en Evaluates plug-in activation behavior based on client configuration data.
     */
    enabled: (config: HttpClientOptions): boolean => !!config.metrics?.enabled,

    /**
     * @ru Настраивает менеджер метрик и расширяет инстанс ядра методами отслеживания статистики.
     * @en Initializes the metrics manager manager and mutates the core instance with telemetry utilities.
     * @param ctx - Shared plugin configuration context.
     */
    setup(
      ctx: PluginContext & { core?: IHyperCore; config: HttpClientOptions },
    ): void {
      const finalOptions = {
        ...ctx.config.metrics,
        ...options,
      } as MetricsOptions;

      metrics = new MetricsManager(finalOptions);
      ctx.metrics = metrics;

      if (ctx.core) {
        ctx.core.getAllMetrics = () => metrics.getAll();
        ctx.core.getMetricsSummary = () => metrics.getSummary();
        ctx.core.getStats = () => metrics.getSummary();
      }
    },

    /**
     * @ru Фаза перехвата запроса. Проверяет доступность эндпоинта по схеме деградации и фиксирует время старта конвейера.
     * @en Request interception phase. Validates route availability state via circuit rules and tracks execution entry timing.
     * @param req - Contextual internal request options.
     */
    onRequest(req: InternalRequest): void {
      if (metrics.isCircuitOpen(req.url)) {
        throw new Error(
          `[Hyperttp] Circuit breaker is OPEN for URL: ${req.url}`,
        );
      }

      timingMap.set(req, {
        wallClockStart: Date.now(),
        hrStart: performance.now(),
      });
    },

    /**
     * @ru Обрабатывает успешный ответ, агрегирует временные задержки стадий обработки и логирует сетевой размер пакета.
     * @en Handles successful network response, processes cumulative step timings and aggregates bandwidth payloads.
     * @param res - Received response execution object.
     * @param req - Contextual internal request options.
     */
    onResponse(res: HttpResponse<any>, req: InternalRequest): void {
      const timing = timingMap.get(req);
      if (!timing) return;
      timingMap.delete(req);

      const hrDuration = performance.now() - timing.hrStart;
      const meta = req.meta as MetaWithTimings | undefined;
      const retries = meta?.retryCount ?? 0;
      const cacheFlags = res as ResponseWithCacheFlags;

      metrics.record({
        url: req.url,
        method: req.method,
        duration: hrDuration,
        statusCode: res.status || 200,
        startTime: timing.wallClockStart,
        endTime: Date.now(),
        bytesReceived: Number(res.headers?.["content-length"]) || 0,
        bytesSent: 0,
        retries: retries,
        cached: !!cacheFlags.fromCache,
        stages: {
          serializationMs: meta?.timings?.serializationMs ?? 0,
          networkMs: meta?.timings?.networkMs ?? 0,
        },
      });

      if (res.headers?.["content-length"]) {
        metrics.recordBytes(Number(res.headers["content-length"]));
      }
    },

    /**
     * @ru Перехватывает ошибки и сбои конвейера, вычисляет код состояния ответа и регистрирует инцидент в менеджере метрик.
     * @en Captures pipeline errors and failures, extracts error response indicators and submits telemetry payload data.
     * @param err - Intercepted runtime exception container.
     * @param req - Contextual internal request options.
     */
    onError(err: any, req: InternalRequest): void {
      const timing = timingMap.get(req);
      if (!timing) return;
      timingMap.delete(req);

      const hrDuration = performance.now() - timing.hrStart;
      const meta = req.meta as MetaWithTimings | undefined;
      const retries = meta?.retryCount ?? 0;

      const errTarget = err as Record<string, unknown> | null;

      const statusCode =
        typeof errTarget?.status === "number"
          ? errTarget.status
          : typeof errTarget?.statusCode === "number"
            ? errTarget.statusCode
            : 500;

      metrics.record({
        url: req.url,
        method: req.method,
        duration: hrDuration,
        statusCode: statusCode,
        startTime: timing.wallClockStart,
        endTime: Date.now(),
        bytesReceived: 0,
        bytesSent: 0,
        retries: retries,
        cached: false,
      });
    },
  };
}
