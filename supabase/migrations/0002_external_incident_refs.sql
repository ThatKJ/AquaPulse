-- Incidents and interventions are created by the engine in the browser and are not yet persisted,
-- so webhook rows must be able to reference an incident id that has no row here.
-- These columns stay as plain text ids (indexed); the foreign keys return when incidents are persisted.
alter table verification_requests drop constraint verification_requests_incident_id_fkey;
alter table interventions drop constraint interventions_incident_id_fkey;
alter table alerts drop constraint alerts_incident_id_fkey;

alter table interventions add column note text;
alter table interventions alter column bundle set default '{}'::jsonb;

-- Alert webhook retries carry the same key and must not send twice.
alter table alerts add column idempotency_key text unique;
