begin;

alter table public.emr_records
  add column save_type text not null default 'draft'
    check (save_type in ('draft', 'certified')),
  add column written_at timestamptz;

update public.emr_records
set save_type = case when writer_role = 'doctor' then 'certified' else 'draft' end,
    writer_role = 'nurse',
    written_at = coalesce(created_at, now());

alter table public.emr_records alter column written_at set not null;

commit;
