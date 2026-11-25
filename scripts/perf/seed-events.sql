-- 통계 성능 시험용 이용 기록 100만 건 (docs/performance.md). 시험용 DB에만 넣는다. 운영 DB에 넣지 않는다.
--   현실 분포(기본): 방문 66,667번 × 방문당 15개, 방문자 2만 명
--   최악 분포: psql -v worst=1 → 이벤트마다 시각 무작위, 방문자 5만 명
-- 실행: psql "$DATABASE_URL" -f scripts/perf/seed-events.sql
\set ON_ERROR_STOP on
\if :{?worst}
\else
  \set worst 0
\endif
TRUNCATE usage_event RESTART IDENTITY;
INSERT INTO usage_event (type, lang, form_key, form_no, field_id, search_term, result_count, duration_sec, visitor_id, created_at)
SELECT t.type::event_type,
       (ARRAY['ko','en','zh','ja','vi'])[1 + (g % 5)]::lang,
       CASE WHEN t.type LIKE 'fill%' OR t.type = 'field_open' THEN (ARRAY['birth-report','move-in','marriage'])[1 + (g % 3)] END,
       CASE WHEN t.type IN ('form_view','form_download','detail_time') THEN 1 + (g % 41) END,
       CASE WHEN t.type = 'field_open' THEN 'field' || (g % 30) END,
       CASE WHEN t.type = 'search' THEN 'term' || (g % 500) END,
       CASE WHEN t.type = 'search' THEN g % 7 END,
       CASE WHEN t.type = 'detail_time' THEN g % 600 END,
       md5('v' || (g % 50000))::uuid,
       now() - (random() * interval '365 days')
FROM generate_series(1, 1000000) g
CROSS JOIN LATERAL (SELECT (ARRAY['form_view','form_view','form_view','list_view','landing_view','form_download','search','detail_time',
  'fill_start','field_open','field_open','fill_preview','fill_png_save','fill_print','language_select'])[1 + (g % 15)] AS type) t;
\if :worst
\else
UPDATE usage_event u SET visitor_id = md5('v' || (v.visit % 20000))::uuid, created_at = v.t + (u.id % 15) * interval '20 seconds'
FROM (SELECT visit, now() - (random() * interval '365 days') - interval '10 minutes' AS t FROM generate_series(0, 66666) visit) v
WHERE v.visit = (u.id - 1) / 15;
\endif
VACUUM ANALYZE usage_event;
SELECT count(*) AS events, count(DISTINCT visitor_id) AS visitors FROM usage_event;
