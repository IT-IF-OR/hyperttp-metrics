import type {
  HyperCore,
  HyperPlugin,
  InternalRequest,
  HttpClientOptions,
  RequestMetrics,
} from "@hyperttp/core";
import { MetricsManager } from "./utils/MetricsManager.js";
import type { MetricsOptions } from "./types/metrics.js";

interface MetricsHyperCore extends HyperCore {
  getAllMetrics: () => RequestMetrics[];
}

export function withMetrics(
  client: HyperCore,
  options?: MetricsOptions,
): MetricsHyperCore {
  const metrics = new MetricsManager(options);
  const next = client.dispatch.bind(client);

  client.dispatch = async <T = any>(req: InternalRequest): Promise<T> => {
    const start = performance.now();
    try {
      const result = await next<T>(req);
      const duration = performance.now() - start;

      metrics.record({
        url: typeof req.url === "string" ? req.url : req.url.getURL(),
        method: req.method,
        duration,
        statusCode: result.status || 200,
        startTime: start,
        endTime: performance.now(),
        bytesReceived: 0,
        bytesSent: 0,
        retries: 0,
        cached: false,
        stages: req.meta?.timings || {},
      });

      return result as T;
    } catch (error: any) {
      metrics.record({
        url: typeof req.url === "string" ? req.url : req.url.getURL(),
        method: req.method,
        duration: performance.now() - start,
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

  const extended = client as MetricsHyperCore;
  extended.getAllMetrics = () => metrics.getAll();
  return extended;
}

declare module "@hyperttp/core" {
  interface HyperttpPluginsExtension {
    metrics?: MetricsOptions & { enabled: boolean };
  }
}

export const MetricsPlugin: HyperPlugin = {
  name: "hyperttp-metrics",
  phase: "START",
  enabled: (config: HttpClientOptions) => !!config.metrics?.enabled,
  apply: (client: HyperCore, config: HttpClientOptions) =>
    withMetrics(client, config.metrics),
};
