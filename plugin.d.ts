import type { HyperPlugin } from "@hyperttp/types";
import type { MetricsOptions } from "./types/metrics.js";
import { MetricsManager } from "./utils/MetricsManager.js";
declare module "@hyperttp/types" {
    interface HyperClientOptions {
        metrics?: MetricsOptions;
    }
    interface IHyperCore {
        getMetrics?: (key: string) => RequestMetrics | RequestMetrics[] | undefined;
        getAllMetrics?: () => RequestMetrics[];
        getMetricsSummary?: () => ReturnType<MetricsManager["getSummary"]> | null;
        getStats?: () => ReturnType<MetricsManager["getSummary"]> | null;
        resetMetrics?: () => void;
        resetCircuits?: () => void;
    }
}
export declare function withMetrics(options?: Partial<MetricsOptions>): HyperPlugin;
//# sourceMappingURL=plugin.d.ts.map