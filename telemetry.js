// telemetry.js
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { ConsoleSpanExporter } = require('@opentelemetry/sdk-trace-base');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-proto');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-proto');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');

// Configure the service name and other resource attributes
const resource = new Resource({
  [SemanticResourceAttributes.SERVICE_NAME]: 'horsey-backend',
  [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'production',
});

// Configure the OTLP exporters for metrics and traces
const metricExporter = new OTLPMetricExporter({
  url: 'https://otlp-gateway-prod-us-east-0.grafana.net/v1/metrics',
  headers: {
    Authorization: `Basic ${Buffer.from(`${process.env.GRAFANA_CLOUD_USERNAME}:${process.env.GRAFANA_CLOUD_SERVICE_ACCOUNT_TOKEN}`).toString('base64')}`
  },
});

const traceExporter = new OTLPTraceExporter({
  url: 'https://otlp-gateway-prod-us-east-0.grafana.net/v1/traces',
  headers: {
    Authorization: `Basic ${Buffer.from(`${process.env.GRAFANA_CLOUD_USERNAME}:${process.env.GRAFANA_CLOUD_SERVICE_ACCOUNT_TOKEN}`).toString('base64')}`
  },
});

// Create and configure the OpenTelemetry SDK
const sdk = new NodeSDK({
  resource,
  metricExporter,
  spanExporter: traceExporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      // Enable all auto-instrumentations
      '@opentelemetry/instrumentation-http': { enabled: true },
      '@opentelemetry/instrumentation-express': { enabled: true },
      '@opentelemetry/instrumentation-mongodb': { enabled: true },
    }),
  ],
});

// Initialize the SDK and register the global tracer provider
console.log('Initializing OpenTelemetry...');
sdk.start()
  .then(() => console.log('OpenTelemetry initialized successfully'))
  .catch(error => console.error('Error initializing OpenTelemetry', error));

// Gracefully shut down the SDK on process exit
process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('OpenTelemetry SDK shut down'))
    .catch((error) => console.log('Error shutting down OpenTelemetry SDK', error))
    .finally(() => process.exit(0));
});

// Export for use in other modules
module.exports = { sdk };
