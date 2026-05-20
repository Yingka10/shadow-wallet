-- Grant table-level access to authenticated role for tables created via SQL migration.
-- Tables created via SQL (not the Supabase dashboard) do not get automatic grants.
grant select, insert, update, delete on public.redemption_requests to authenticated;
grant select, insert, update, delete on public.growth_moments to authenticated;
grant select, insert, update, delete on public.parent_observations to authenticated;
