// n8n Workflow SDK source of the published workflow "AquaPulse — National Data Refresh" (id utycnfXQb1TjV2tH).
// Reading the public national endpoint makes the site refresh NDMA and IMD after it responds (single flight,
// cadence-limited), so the data stays fresh with no visitors. No secrets.
import { workflow, node, trigger } from '@n8n/workflow-sdk';

const every15 = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.4, config: { name: 'Every 15 minutes', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 15 }] } } } });
const refresh = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: { name: 'Read national snapshot (triggers refresh)', retryOnFail: true, maxTries: 2, waitBetweenTries: 5000, parameters: { method: 'GET', url: 'https://aquapulse-liard.vercel.app/api/national', options: { timeout: 30000 } } }
});

export default workflow('aquapulse-national-refresh', 'AquaPulse — National Data Refresh').add(every15).to(refresh);
