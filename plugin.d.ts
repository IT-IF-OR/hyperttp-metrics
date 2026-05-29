import type { HyperPlugin, RequestMetrics } from "@hyperttp/types";
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
/**
 * @ru Сквозной сбор метрик производительности. Только telemetry.
 * @en End-to-end performance metrics collection. Telemetry only.
 */
export declare function withMetrics(options?: Partial<MetricsOptions>): HyperPlugin;
//# sourceMappingURL=plugin.d.ts.map