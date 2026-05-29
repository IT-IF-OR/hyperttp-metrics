import type {
  HyperPlugin,
  InternalRequest,
  RequestMetrics,
  HttpResponse,
  HttpClientOptions,
} from "@hyperttp/types";
import { MetricsManager } from "./utils/MetricsManager.js";
import type { MetricsOptions } from "./types/metrics.js";

declare module "@hyperttp/types" {
  interface HyperttpPluginsExtension {
    metrics?: MetricsOptions & {
      enabled: boolean;
    };
  }

  interface IHyperCore {
    getMetrics?: (key: string) => RequestMetrics | RequestMetrics[] | undefined;
    getAllMetrics?: () => RequestMetrics[];
    getMetricsSummary?: () => ReturnType<MetricsManager["getSummary"]>;
    getStats?: () => ReturnType<MetricsManager["getSummary"]>;
    resetMetrics(): void;
    resetCircuits(): void;
  }

  interface PluginContext {
    metrics?: MetricsManager;
  }
}

interface InflightTiming {
  wallClockStart: number;
  hrStart: number;
}

function recordMetrics(
  metrics: MetricsManager,
  timingMap: WeakMap<InternalRequest, InflightTiming>,
  req: InternalRequest | undefined,
  res: HttpResponse<unknown> | null,
  err: unknown,
): void {
  if (!req) return;

  const timing = timingMap.get(req);
  if (!timing) return;

  timingMap.delete(req);

  try {
    const hrDuration = performance.now() - timing.hrStart;
    const meta = req.meta as
      | {
          retryCount?: number;
          timings?: { serializationMs?: number; networkMs?: number };
        }
      | undefined;

    const retries = meta?.retryCount ?? 0;

    const statusCode =
      res?.status ??
      (() => {
        const errTarget = err as Record<string, unknown> | null;
        if (typeof errTarget?.status === "number") return errTarget.status;
        if (typeof errTarget?.statusCode === "number")
          return errTarget.statusCode;
        return 500;
      })();

    const contentLengthRaw =
      res?.headers?.["content-length"] ?? res?.headers?.["Content-Length"];

    const contentLength = Array.isArray(contentLengthRaw)
      ? Number(contentLengthRaw[0]) || 0
      : Number(contentLengthRaw) || 0;

    metrics.record({
      url: req.url,
      method: req.method,
      duration: hrDuration,
      statusCode,
      startTime: timing.wallClockStart,
      endTime: Date.now(),
      bytesReceived: contentLength,
      bytesSent: 0,
      retries,
      cached: false,
      stages: {
        serializationMs: meta?.timings?.serializationMs ?? 0,
        networkMs: meta?.timings?.networkMs ?? 0,
      },
    });

    if (contentLength > 0) {
      metrics.recordBytes(contentLength);
    }
  } catch {
    //
  }
}

/**
 * @ru Сквозной сбор метрик производительности. Только telemetry.
 * @en End-to-end performance metrics collection. Telemetry only.
 */
export function withMetrics(options?: Partial<MetricsOptions>): HyperPlugin {
  let metrics: MetricsManager | undefined;
  const timingMap = new WeakMap<InternalRequest, InflightTiming>();

  return {
    name: "hyperttp-metrics",

    enabled: (config: HttpClientOptions): boolean => {
      return !!(config as any).metrics?.enabled;
    },

    setup(ctx) {
      metrics = new MetricsManager({
        ...(ctx.config as any).metrics,
        ...options,
      });

      ctx.metrics = metrics;

      if (ctx.core) {
        ctx.core.getAllMetrics = () => metrics?.getAll() ?? [];
        ctx.core.getMetricsSummary = () => metrics?.getSummary() ?? null;
        ctx.core.getStats = () => metrics?.getSummary() ?? null;
        ctx.core.resetMetrics = () => metrics?.clear();
        ctx.core.resetCircuits = () => {};
      }
    },

    onRequest(req) {
      try {
        timingMap.set(req, {
          wallClockStart: Date.now(),
          hrStart: performance.now(),
        });
      } catch {
        //
      }
    },

    onResponse(res, req) {
      if (!metrics) return;
      recordMetrics(metrics, timingMap, req, res, null);
    },

    onError(err, req) {
      if (!metrics) return;
      recordMetrics(metrics, timingMap, req, null, err);
    },
  };
}
