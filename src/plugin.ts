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
}

export function withMetrics(options?: Partial<MetricsOptions>): HyperPlugin {
  let metrics: MetricsManager;

  return {
    name: "hyperttp-metrics",
    phase: "START",
    enabled: (config: HttpClientOptions) => !!config.metrics?.enabled,

    setup(core, config) {
      const finalOptions = {
        ...config.metrics,
        ...options,
      } as MetricsOptions;

      metrics = new MetricsManager(finalOptions);
      const extendedCore = core as MetricsCoreExtension;
      extendedCore.getAllMetrics = () => metrics.getAll();
    },

    wrapDispatch: (next) => {
      return async <T>(req: InternalRequest): Promise<HttpResponse<T>> => {
        const start = performance.now();
        try {
          const result = await next<T>(req);
          const duration = performance.now() - start;

          metrics.record({
            url: req.url,
            method: req.method,
            duration,
            statusCode: result.status || 200,
            startTime: start,
            endTime: performance.now(),
            bytesReceived: 0,
            bytesSent: 0,
            retries: 0,
            cached: false,
            stages: (req.meta?.timings || {}) as any,
          });

          return result;
        } catch (error: any) {
          const duration = performance.now() - start;
          metrics.record({
            url: req.url,
            method: req.method,
            duration,
            statusCode: error?.status || 500,
            startTime: start,
            endTime: performance.now(),
            bytesReceived: 0,
            bytesSent: 0,
            retries: 0,
            cached: false,
          });
          throw error;
        }
      };
    },
  };
}
