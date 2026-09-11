-- Campaign schedule set 2026-09-11 (Asia/Taipei):
-- nominate 9/14 (Mon) 00:00 – 9/27 (Sun) 23:59:59; vote 9/28 (Mon) 00:00 – 10/4 (Sun) 23:59:59
update public.settings set
  nominate_open  = '2026-09-14 00:00:00+08',
  nominate_close = '2026-09-27 23:59:59+08',
  vote_open      = '2026-09-28 00:00:00+08',
  vote_close     = '2026-10-04 23:59:59+08',
  phase = 'nominate'
where id = 1;
select phase, nominate_open, nominate_close, vote_open, vote_close, results_label from public.settings where id = 1;
