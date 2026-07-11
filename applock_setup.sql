-- 대원항업 탱고 GIS — 사업 잠금 테이블 (BUILD 790)
-- Supabase 대시보드 → SQL Editor 에 그대로 붙여넣고 한 번 실행하세요. (딱 한 번이면 끝)

create table if not exists applock (
  stage      text not null,          -- 공정 (survey/field/tango/realtime/position)
  project_id text not null,          -- 사업 id
  holder     text,                   -- 편집 중인 작업자 이름
  ts         timestamptz default now(),
  primary key (stage, project_id)
);

alter table applock enable row level security;

-- 앱(익명 키)이 잠금을 읽고/쓰게 허용
drop policy if exists applock_all on applock;
create policy applock_all on applock for all using (true) with check (true);
