-- ── redemption_requests ──────────────────────────────────────────────────────
create table if not exists redemption_requests (
  id                  uuid        primary key default gen_random_uuid(),
  family_id           uuid        not null references families(id) on delete cascade,
  child_id            uuid        not null references children(id) on delete cascade,
  name                text        not null,
  description         text,
  coin_cost           integer     not null,
  status              text        not null default 'pending'
                        check (status in ('pending','approved','rejected')),
  ai_verdict          text        check (ai_verdict in ('ok','high')),
  ai_reason           text,
  ai_suggested_coins  integer,
  adjusted_coins      integer,
  parent_note         text,
  created_at          timestamptz not null default now(),
  reviewed_at         timestamptz
);

alter table redemption_requests enable row level security;

create policy "family members can view redemption requests"
  on redemption_requests for select
  using (family_id = my_family_id());

create policy "children can insert their own requests"
  on redemption_requests for insert
  with check (family_id = my_family_id());

create policy "parents can update redemption requests"
  on redemption_requests for update
  using (family_id = my_family_id());

-- ── growth_moments ────────────────────────────────────────────────────────────
create table if not exists growth_moments (
  id         uuid        primary key default gen_random_uuid(),
  child_id   uuid        not null references children(id) on delete cascade,
  title      text        not null,
  body       text,
  created_at timestamptz not null default now()
);

alter table growth_moments enable row level security;

create policy "family members can manage growth moments"
  on growth_moments for all
  using (
    child_id in (
      select id from children where family_id = my_family_id()
    )
  );

-- ── parent_observations ───────────────────────────────────────────────────────
create table if not exists parent_observations (
  id         uuid        primary key default gen_random_uuid(),
  task_id    uuid        not null references tasks(id) on delete cascade,
  child_id   uuid        not null references children(id) on delete cascade,
  obs_type   text        not null
               check (obs_type in ('noaction','quality','bonus','other')),
  note       text,
  reward_adj text,
  created_at timestamptz not null default now()
);

alter table parent_observations enable row level security;

create policy "family members can manage observations"
  on parent_observations for all
  using (
    child_id in (
      select id from children where family_id = my_family_id()
    )
  );
