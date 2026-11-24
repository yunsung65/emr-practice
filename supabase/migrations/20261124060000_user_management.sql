begin;

alter table public.emr_records alter column writer_id drop not null;
alter table public.emr_records drop constraint emr_records_writer_id_fkey;
alter table public.emr_records add constraint emr_records_writer_id_fkey
  foreign key (writer_id) references auth.users(id) on delete set null;

create or replace function public.sync_emr_auth_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email,
    coalesce(new.raw_app_meta_data->>'emr_role', 'student')
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    email = excluded.email,
    role = coalesce(new.raw_app_meta_data->>'emr_role', public.profiles.role);
  return new;
end;
$$;

create trigger zz_emr_sync_auth_profile
after insert or update of email, raw_user_meta_data, raw_app_meta_data on auth.users
for each row execute function public.sync_emr_auth_profile();

create or replace function public.keep_emr_administrator()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'nurse' and (tg_op = 'DELETE' or new.role <> 'nurse') then
    perform pg_catalog.pg_advisory_xact_lock(20261124, 1);
    if not exists (select 1 from public.profiles where role = 'nurse' and id <> old.id) then
      raise exception '마지막 관리자 계정은 삭제하거나 학생으로 변경할 수 없습니다.';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger keep_emr_administrator
before delete or update of role on public.profiles
for each row execute function public.keep_emr_administrator();

revoke all on function public.sync_emr_auth_profile() from public;
revoke all on function public.keep_emr_administrator() from public;

commit;
