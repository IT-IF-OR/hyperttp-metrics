# @hyperttp/metrics

> English | [Русский](https://github.com/IT-IF-OR/hyperttp-metrics/tree/main/lang/ru)

Metrics plugin for Hyperttp.

## Features

- Collects request lifecycle metrics from the Core v2 pipeline.
- Supports protocol-neutral `SendRequest`, `UniversalResponse`, and `RequestContext` values.
- Keeps metrics collection isolated as an optional plugin.

## Installation

```bash
npm install @hyperttp/metrics
# or
bun add @hyperttp/metrics
```

## Usage

```ts
import { HyperClient } from "hyperttp";
import { withMetrics } from "@hyperttp/metrics";

const client = new HyperClient({
  plugins: [withMetrics()],
});
```

Configure the plugin with the exported `MetricsOptions` type.

## License

MIT © dirold2
