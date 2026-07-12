-- 대원항업 탱고 GIS — 사업 잠금 테이블 (BUILD 790~)
create table if not exists applock (
  stage text not null, project_id text not null, holder text,
  ts timestamptz default now(), primary key (stage, project_id)
);
alter table applock enable row level security;
drop policy if exists applock_all on applock;
create policy applock_all on applock for all using (true) with check (true);
