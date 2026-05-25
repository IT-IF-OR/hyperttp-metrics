import type {
  HyperPlugin,
  InternalRequest,
  HttpClientOptions,
  HttpResponse,
  RequestMetrics,
  HyperCore,
  PluginContext,
} from "@hyperttp/core";
import { MetricsManager } from "./utils/MetricsManager.js";
import type {
  MetaWithTimings,
  MetricsOptions,
  ResponseWithCacheFlags,
} from "./types/metrics.js";

declare module "@hyperttp/core" {
  interface HyperttpPluginsExtension {
    metrics?: MetricsOptions & { enabled?: boolean };
  }

  interface HyperCore {
    getMetrics?: (key: string) => RequestMetrics | RequestMetrics[] | undefined;
    getAllMetrics?: () => RequestMetrics[];
    getMetricsSummary?: () => ReturnType<MetricsManager["getSummary"]>;
    getStats?: () => ReturnType<MetricsManager["getSummary"]>;
  }

  interface PluginContext {
    metrics?: MetricsManager;
  }
}

export function withMetrics(options?: Partial<MetricsOptions>): HyperPlugin {
  let metrics: MetricsManager;

  return {
    name: "hyperttp-metrics",
    phase: "START",
    enabled: (config: HttpClientOptions) => !!config.metrics?.enabled,

    setup(
      ctx: PluginContext & { core?: HyperCore; config: HttpClientOptions },
    ) {
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

    wrapDispatch: (next) => {
      return async <T>(req: InternalRequest): Promise<HttpResponse<T>> => {
        if (metrics.isCircuitOpen(req.url)) {
          throw new Error(
            `[Hyperttp] Circuit breaker is OPEN for URL: ${req.url}`,
          );
        }

        const wallClockStart = Date.now();
        const hrStart = performance.now();

        const meta = req.meta as MetaWithTimings | undefined;
        const retries = meta?.retryCount ?? 0;

        try {
          const result = await next<T>(req);
          const hrDuration = performance.now() - hrStart;
          const cacheFlags = result as ResponseWithCacheFlags;

          metrics.record({
            url: req.url,
            method: req.method,
            duration: hrDuration,
            statusCode: result.status || 200,
            startTime: wallClockStart,
            endTime: Date.now(),
            bytesReceived: Number(result.headers?.["content-length"]) || 0,
            bytesSent: 0,
            retries: retries,
            cached: !!cacheFlags.fromCache,
            stages: {
              serializationMs: meta?.timings?.serializationMs ?? 0,
              networkMs: meta?.timings?.networkMs ?? 0,
            },
          });

          if (result.headers?.["content-length"]) {
            metrics.recordBytes(Number(result.headers["content-length"]));
          }

          return result;
        } catch (error: unknown) {
          const hrDuration = performance.now() - hrStart;
          const errTarget = error as Record<string, unknown> | null;

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
            startTime: wallClockStart,
            endTime: Date.now(),
            bytesReceived: 0,
            bytesSent: 0,
            retries: retries,
            cached: false,
          });

          throw error;
        }
      };
    },
  };
}
