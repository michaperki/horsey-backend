// generate-prometheus-config.js
const fs = require('fs');
require('dotenv').config(); // Load environment variables from .env file

const prometheusConfig = `
global:
  scrape_interval: 60s

remote_write:
  - url: ${process.env.GRAFANA_CLOUD_PROMETHEUS_URL}
    authorization:
      credentials: ${process.env.GRAFANA_CLOUD_SERVICE_ACCOUNT_TOKEN}
      type: Bearer

scrape_configs:
  - job_name: prometheus
    static_configs:
      - targets: ["localhost:9090"]
  
  - job_name: horsey-backend
    metrics_path: /metrics
    static_configs:
      - targets: ["localhost:5000"]
  
  - job_name: node-exporter
    static_configs:
      - targets: ["localhost:9100"]
`;

fs.writeFileSync('./prometheus/prometheus.yml', prometheusConfig);
console.log('Prometheus configuration generated with environment variables');
