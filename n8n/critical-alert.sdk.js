// n8n Workflow SDK source of the DRAFT workflow "AquaPulse — Critical Alert" (id hnTKNXFrSpIu5Rbu, not published).
// Before publishing: create a Header Auth credential named "AquaPulse webhook secret" (header x-aquapulse-secret,
// value = the site's WEBHOOK_SECRET) and select it on the HTTP node. AquaPulse sends only to TWILIO_ALLOWED_TO.
import { workflow, node, trigger, ifElse, newCredential, expr } from '@n8n/workflow-sdk';

const incoming = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.2,
  config: { name: 'Critical incident', parameters: { httpMethod: 'POST', path: 'aquapulse/incident-critical', responseMode: 'responseNode', options: {} } }
});

const gate = ifElse({
  version: 2.2,
  config: {
    name: 'Risk >= 80 and confidence >= 70?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, typeValidation: 'loose' },
        conditions: [
          { leftValue: expr('{{ $json.body.incidentId }}'), operator: { type: 'string', operation: 'notEmpty' } },
          { leftValue: expr('{{ Number($json.body.risk) }}'), rightValue: 80, operator: { type: 'number', operation: 'gte' } },
          { leftValue: expr('{{ Number($json.body.evidenceScore) }}'), rightValue: 70, operator: { type: 'number', operation: 'gte' } }
        ],
        combinator: 'and'
      }
    }
  }
});

const sendAlert = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'AquaPulse: record and send alert',
    onError: 'continueErrorOutput',
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    credentials: { httpHeaderAuth: newCredential('AquaPulse webhook secret') },
    parameters: {
      method: 'POST',
      url: 'https://aquapulse-liard.vercel.app/api/webhooks/alert',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify({ incidentId: String($json.body.incidentId).slice(0, 32), audience: String($json.body.area ?? "Operations").slice(0, 120), body: ("AquaPulse Test / Demo. Critical water incident " + $json.body.incidentId + ($json.body.area ? " at " + $json.body.area : "") + ". Severity " + ($json.body.severity ?? "n/a") + ", water risk " + $json.body.risk + "/100, confidence " + $json.body.evidenceScore + "/100." + ($json.body.reason ? " Why: " + $json.body.reason + "." : "") + ($json.body.response ? " Recommended: " + $json.body.response + "." : "") + " https://aquapulse-liard.vercel.app/?view=local").slice(0, 600), to: [...new Set($json.body.recipients ?? [])].slice(0, 50), idempotencyKey: "alert:" + $json.body.incidentId + ":critical" }) }}'),
      options: { timeout: 30000 }
    }
  }
});

const respondSent = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Respond: alert result', parameters: { respondWith: 'json', responseBody: expr('{{ JSON.stringify($json) }}'), options: { responseCode: 200 } } } });
const respondBelow = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Respond: below threshold', parameters: { respondWith: 'json', responseBody: '{"sent":false,"reason":"Needs incidentId, risk >= 80 and evidenceScore >= 70."}', options: { responseCode: 200 } } } });
const respondFailed = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Respond: AquaPulse failed', parameters: { respondWith: 'json', responseBody: '{"sent":false,"reason":"AquaPulse did not accept the alert."}', options: { responseCode: 502 } } } });

export default workflow('aquapulse-critical-alert', 'AquaPulse — Critical Alert')
  .add(incoming)
  .to(gate.onTrue(sendAlert.to(respondSent)).onFalse(respondBelow))
  .add(sendAlert.onError(respondFailed));
