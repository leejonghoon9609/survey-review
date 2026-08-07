-- =====================================================================
-- [BUILD 1422] 목록 조회 가속: payload에서 자주 쓰는 값을 생성 컬럼으로 분리
-- Supabase 대시보드 > SQL Editor 에 전체 붙여넣고 1회 실행 (실행 후 재실행해도 안전)
-- 데이터/성과는 절대 변경되지 않습니다. 저장 시 자동 갱신되는 파생 컬럼만 추가됩니다.
-- =====================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['realtime_projects','survey_projects','field_projects','tango_projects','position_projects'] LOOP
    EXECUTE format('ALTER TABLE %I
      ADD COLUMN IF NOT EXISTS g_stage   text GENERATED ALWAYS AS (payload->>''stage'') STORED,
      ADD COLUMN IF NOT EXISTS g_del     text GENERATED ALWAYS AS (payload->>''delAt'') STORED,
      ADD COLUMN IF NOT EXISTS g_hide    text GENERATED ALWAYS AS (payload->>''pxHide'') STORED,
      ADD COLUMN IF NOT EXISTS g_tamsa   text GENERATED ALWAYS AS (payload->>''tamsa'') STORED,
      ADD COLUMN IF NOT EXISTS g_rtdone  text GENERATED ALWAYS AS (payload->''rtDone''->>''done'') STORED,
      ADD COLUMN IF NOT EXISTS g_routing text GENERATED ALWAYS AS (payload->>''routingDone'') STORED,
      ADD COLUMN IF NOT EXISTS g_ffinal  text GENERATED ALWAYS AS (payload->''fieldDone''->>''final'') STORED,
      ADD COLUMN IF NOT EXISTS g_tgar    text GENERATED ALWAYS AS (payload->>''tangoArchived'') STORED', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (updated_at DESC)', t||'_upd_idx', t);
  END LOOP;
END $$;
