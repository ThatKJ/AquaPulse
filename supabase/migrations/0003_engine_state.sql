-- The browser engine now mirrors its incidents into the database. Its asset ids (D101..) are the engine's
-- synthetic set, of which only a few are seeded here, so the asset reference becomes a plain id as well.
alter table incidents drop constraint incidents_suspected_asset_id_fkey;
-- One result row per intervention (the mirror upserts).
alter table intervention_results add constraint intervention_results_intervention_id_key unique (intervention_id);
