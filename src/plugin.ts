import type {
  HyperPlugin,
  InternalRequest,
  HttpClientOptions,
  HttpResponse,
  RequestMetrics,
  HyperCore,
} from "@hyperttp/core";
import { MetricsManager } from "./utils/MetricsManager.js";
import type { MetricsOptions } from "./types/metrics.js";

export type MetricsCoreExtension = HyperCore & {
  getAllMetrics: () => RequestMetrics[];
};

declare module "@hyperttp/core" {
  interface HyperttpPluginsExtension {
    metrics?: MetricsOptions & { enabled?: boolean };
  }

  interface HyperCore {
    getMetrics?: (key: string) => RequestMetrics | RequestMetrics[] | undefined;
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

    setup(ctx) {
      const { core, config } = ctx as any;
      const finalOptions = {
        ...config.metrics,
        ...options,
      } as MetricsOptions;

      metrics = new MetricsManager(finalOptions);

      ctx.metrics = metrics;

      if (core) {
        (core as any).getAllMetrics = () => metrics.getAll();
        (core as any).getMetricsSummary = () => metrics.getSummary();
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
        const retries = ((req.meta as any)?.retryCount as number) || 0;

        try {
          const result = await next<T>(req);
          const hrDuration = performance.now() - hrStart;

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
            cached: !!(result as any).fromCache,
            stages: (req.meta?.timings || {}) as any,
          });

          if (result.headers?.["content-length"]) {
            metrics.recordBytes(Number(result.headers["content-length"]));
          }

          return result;
        } catch (error: any) {
          const hrDuration = performance.now() - hrStart;

          metrics.record({
            url: req.url,
            method: req.method,
            duration: hrDuration,
            statusCode: error?.status || error?.statusCode || 500,
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
