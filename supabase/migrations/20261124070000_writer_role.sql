alter table public.emr_records
  add column writer_role text not null default 'nurse'
  check (writer_role in ('nurse', 'doctor'));
