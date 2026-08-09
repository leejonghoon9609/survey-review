-- 대원항업 탱고 GIS — payload 다이어트 1차 (BUILD 1491)
-- Supabase 대시보드 → SQL Editor 에 그대로 붙여넣고 한 번만 실행하세요.
-- 후측량 CSV 원문을 payload에서 분리 저장하는 heavy 컬럼 추가 (5개 공정 전부)
alter table if exists survey_projects   add column if not exists heavy jsonb;
alter table if exists field_projects    add column if not exists heavy jsonb;
alter table if exists tango_projects    add column if not exists heavy jsonb;
alter table if exists realtime_projects add column if not exists heavy jsonb;
alter table if exists position_projects add column if not exists heavy jsonb;
