-- Down for 20261025120000_rhoe_core. Drops RhoeFlow's schema and everything in it; touches
-- nothing of WorkEdge's (ADR-028, WO-03 §8). Run the templates and storage downs first if applied.
drop schema if exists rhoe cascade;
