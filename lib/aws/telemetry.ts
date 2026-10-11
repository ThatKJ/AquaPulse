// Amazon CloudWatch Embedded Metric Format (EMF) emitter.
// Generates high-resolution cloud metrics without external API overhead or network latencies.

export type MetricDimension = [string, string];

export type AquaPulseMetric = {
  name: string;
  value: number;
  unit: "Count" | "Milliseconds" | "None" | "Percent" | "Bytes";
};

/**
 * Emits an AWS CloudWatch Embedded Metric Format (EMF) payload to standard output.
 * CloudWatch Logs automatically ingests these into CloudWatch Custom Metrics.
 */
export function emitCloudWatchMetrics(options: {
  namespace?: string;
  dimensions?: Record<string, string>;
  metrics: AquaPulseMetric[];
  properties?: Record<string, unknown>;
}) {
  const namespace = options.namespace ?? "AquaPulse/ResilienceEngine";
  const dimMap = options.dimensions ?? { Environment: process.env.NODE_ENV ?? "production" };
  const dimKeys = Object.keys(dimMap);

  const metricDefs = options.metrics.map((m) => ({
    Name: m.name,
    Unit: m.unit,
  }));

  const metricValues: Record<string, number> = {};
  for (const m of options.metrics) {
    metricValues[m.name] = m.value;
  }

  const emfPayload = {
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [
        {
          Namespace: namespace,
          Dimensions: [dimKeys],
          Metrics: metricDefs,
        },
      ],
    },
    ...dimMap,
    ...metricValues,
    ...(options.properties ?? {}),
  };

  // EMF requires JSON lines printed directly to log output
  console.log(JSON.stringify(emfPayload));
}

/** Record telemetry for simulation and optimization engine passes. */
export function recordPredictionTelemetry(metrics: {
  scenarioId?: string;
  exposedPopulation: number;
  maxFloodRisk: number;
  maxScarcityRisk: number;
  computationDurationMs?: number;
}) {
  emitCloudWatchMetrics({
    dimensions: {
      Scenario: metrics.scenarioId ?? "unnamed",
      Region: process.env.AWS_REGION ?? "ap-south-1",
    },
    metrics: [
      { name: "ExposedPopulation", value: metrics.exposedPopulation, unit: "Count" },
      { name: "PeakFloodRisk", value: metrics.maxFloodRisk, unit: "Percent" },
      { name: "PeakScarcityRisk", value: metrics.maxScarcityRisk, unit: "Percent" },
      ...(metrics.computationDurationMs
        ? [{ name: "EngineComputeLatencyMs", value: metrics.computationDurationMs, unit: "Milliseconds" as const }]
        : []),
    ],
  });
}

/** Record telemetry when an emergency alert is triggered. */
export function recordAlertTelemetry(alert: {
  incidentId: string;
  transport: "twilio" | "sns" | "demo";
  recipientCount: number;
  status: "sent" | "queued" | "failed";
}) {
  emitCloudWatchMetrics({
    dimensions: {
      Transport: alert.transport,
      Status: alert.status,
    },
    metrics: [
      { name: "AlertDispatchedCount", value: 1, unit: "Count" },
      { name: "AlertRecipientsCount", value: alert.recipientCount, unit: "Count" },
    ],
    properties: {
      incidentId: alert.incidentId,
    },
  });
}
