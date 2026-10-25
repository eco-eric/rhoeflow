-- Quick-pass answers on accepted revisions (WO-03 D2). The server builds each accepted
-- snapshot from the answers (RHOE.quick_pass.box_geometry); the answers are kept beside it for
-- the audit trail. Additive; the immutability trigger on assessment_revisions already covers it.
alter table rhoe.assessment_revisions add column if not exists quick_pass jsonb;
