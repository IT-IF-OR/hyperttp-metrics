import type {
  IHyperCore,
  PluginContext,
  RequestContext,
  SendRequest,
  UniversalResponse,
} from "@hyperttp/types";
import { describe, expect, it } from "vitest";
import { withMetrics } from "../src/index.js";
import type { CollectedRequestMetrics, MetricsOptions } from "../src/index.js";

function requestContext(): RequestContext {
  return {
    requestId: "request-1",
    startTime: Date.now(),
    meta: {},
    state: {},
  };
}

function setup(options?: Partial<MetricsOptions>) {
  const core = {} as IHyperCore;
  const plugin = withMetrics(options);
  plugin.setup?.({ config: { metrics: { enabled: true } }, core } as PluginContext);
  return { core, plugin };
}

async function collect(
  request: SendRequest,
  response: UniversalResponse,
  options?: Partial<MetricsOptions>,
): Promise<CollectedRequestMetrics> {
  const { core, plugin } = setup(options);
  const context = requestContext();
  await plugin.onRequest?.(request, undefined, context);
  await plugin.onResponse?.(response, request, undefined, context);
  return core.getAllMetrics?.()[0] as CollectedRequestMetrics;
}

describe("withMetrics", () => {
  it("keeps REST method, URL, status and content-length defaults", async () => {
    const metric = await collect(
      {
        protocol: "rest",
        input: {
          method: "POST",
          url: "https://example.test/widgets",
          headers: { "Content-Length": "12" },
          body: "ignored because the header wins",
        },
      },
      {
        protocol: "rest",
        ok: true,
        status: 201,
        headers: { "content-length": "7" },
        data: "ignored",
        metadata: { fromCache: true },
      },
    );

    expect(metric).toMatchObject({
      protocol: "rest",
      operationKey: "POST https://example.test/widgets",
      requestLabels: {
        method: "POST",
        url: "https://example.test/widgets",
      },
      method: "POST",
      url: "https://example.test/widgets",
      outcome: "success",
      status: 201,
      statusCode: 201,
      bytesSent: 12,
      bytesReceived: 7,
      cached: true,
    });
  });

  it("uses extractors for a custom protocol without assuming HTTP fields", async () => {
    const metric = await collect(
      {
        protocol: "queue",
        input: { topic: "invoices", payload: new Uint8Array([1, 2, 3]) },
        metadata: { attempt: 2 },
      },
      {
        protocol: "queue",
        ok: true,
        status: 0,
        headers: {},
        data: { acknowledgement: "ack-42", size: 5 },
        metadata: { storage: "local" },
      },
      {
        extractors: {
          operationKey: ({ request }) => `publish:${(request.input as { topic: string }).topic}`,
          requestLabels: ({ request }) => ({
            topic: (request.input as { topic: string }).topic,
            attempt: Number(request.metadata?.attempt),
          }),
          outcome: ({ response }) =>
            (response?.data as { acknowledgement?: string }).acknowledgement
              ? "success"
              : "failure",
          status: ({ response }) => (response?.data as { acknowledgement: string }).acknowledgement,
          bytesSent: ({ request }) => (request.input as { payload: Uint8Array }).payload.byteLength,
          bytesReceived: ({ response }) => (response?.data as { size: number }).size,
          cached: ({ response }) => response?.metadata?.storage === "local",
        },
      },
    );

    expect(metric).toMatchObject({
      protocol: "queue",
      operationKey: "publish:invoices",
      requestLabels: { topic: "invoices", attempt: 2 },
      outcome: "success",
      status: "ack-42",
      bytesSent: 3,
      bytesReceived: 5,
      cached: true,
    });
    expect(metric.method).toBeUndefined();
    expect(metric.url).toBeUndefined();
    expect(metric.statusCode).toBeUndefined();
  });
});
