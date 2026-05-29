import type { RequestMetrics } from "@hyperttp/types";
import type { MetricsOptions } from "../types/metrics.js";
export declare class MetricsManager {
    private readonly storage;
    private readonly latestByUrl;
    private readonly maxSize;
    private readonly ttl;
    private _totalBytesAccumulator;
    private _recordId;
    constructor(config?: MetricsOptions);
    /**
     * @ru Записывает метрику запроса в историю.
     * @en Stores request metrics inside the telemetry history.
     */
    record(metrics: RequestMetrics): void;
    /**
     * @ru Возвращает метрику по точному ключу истории или последнюю по URL.
     * @en Returns metric by exact key or latest metric by URL.
     */
    get(key: string): RequestMetrics | undefined;
    /**
     * @ru Возвращает все валидные (не протухшие) метрики и лениво очищает старые.
     * @en Returns all non-expired metrics and lazily purges expired ones.
     */
    getAll(): RequestMetrics[];
    /**
     * @ru Регистрирует объем полученных байтов.
     * @en Records incoming transferred bytes.
     */
    recordBytes(bytes: number): void;
    /**
     * @ru Возвращает агрегированную сводку метрик.
     * @en Returns aggregated telemetry summary.
     */
    getSummary(): {
        totalRequests: number;
        successRate: number;
        avgDurationMs: number;
        totalBytesReceived: number;
        errorCount: number;
        maxDurationMs: number;
        p99DurationMs: number;
        bottlenecks: {
            serialization: string;
            network: string;
        };
    } | null;
    /**
     * @ru Полностью очищает историю метрик.
     * @en Clears all stored telemetry data.
     */
    clear(): void;
    /**
     * @private
     * @ru Сохраняет запись метрики в FIFO/LRU структуру нативного Map.
     * @en Persists metrics record into the native Map FIFO/LRU structure.
     */
    private storeMetrics;
    /**
     * @private
     * @ru Вычисляет процентиль по заранее отсортированному массиву.
     * @en Calculates percentile from a pre-sorted numeric array.
     */
    private percentileSorted;
}
//# sourceMappingURL=MetricsManager.d.ts.map