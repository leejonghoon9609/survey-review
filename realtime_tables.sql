-- 실시간측량 전용 테이블 생성 (결선DB와 분리)
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 한 번만 실행하세요.
-- survey_* 테이블 구조를 그대로 복사합니다.

create table if not exists realtime_projects (like survey_projects including all);
create table if not exists realtime_photos   (like survey_photos   including all);
create table if not exists realtime_history  (like survey_history  including all);

alter table realtime_projects enable row level security;
alter table realtime_photos   enable row level security;
alter table realtime_history  enable row level security;

drop policy if exists rt_p on realtime_projects;
drop policy if exists rt_h on realtime_photos;
drop policy if exists rt_y on realtime_history;
create policy rt_p on realtime_projects for all using(true) with check(true);
create policy rt_h on realtime_photos   for all using(true) with check(true);
create policy rt_y on realtime_history  for all using(true) with check(true);
