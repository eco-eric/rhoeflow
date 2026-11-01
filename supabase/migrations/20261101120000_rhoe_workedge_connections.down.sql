-- Down for 20261101120000_rhoe_workedge_connections. Drops every stored WorkEdge connection;
-- each account reconnects after an up.
drop table if exists rhoe.workedge_connections;
drop function if exists rhoe.is_connection_admin();
