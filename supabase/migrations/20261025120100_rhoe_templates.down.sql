-- Down for 20261025120100_rhoe_templates.
drop table if exists rhoe.template_editors;
drop table if exists rhoe.template_versions;
drop table if exists rhoe.templates;
drop function if exists rhoe.is_template_editor();
drop function if exists rhoe.templates_guard();
