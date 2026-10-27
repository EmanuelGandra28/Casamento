-- Etapa 2: link individual por família, RSVP por pessoa e área dos padrinhos.
-- Substitui o fluxo PIN + código por WhatsApp. Execute depois de schema.sql.

-- Famílias: link secreto, marcação de padrinhos e recado do RSVP.
alter table public.families
  add column if not exists access_token text not null unique
    default translate(encode(extensions.gen_random_bytes(12), 'base64'), '+/', '-_'),
  add column if not exists is_wedding_party boolean not null default false,
  add column if not exists rsvp_note text not null default '',
  add column if not exists responded_at timestamptz;
alter table public.families alter column pin_code drop not null;

alter table public.weddings add column if not exists rsvp_deadline date;

-- Pessoas de cada família, com resposta individual.
create table if not exists public.guests (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  age_group text not null default 'adult' check (age_group in ('adult', 'child', 'baby')),
  rsvp_status text not null default 'pending' check (rsvp_status in ('pending', 'confirmed', 'declined')),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists guests_family_id_idx on public.guests(family_id);
alter table public.guests enable row level security;
create policy "owner manages guests" on public.guests for all
  using (exists (
    select 1 from public.families f join public.weddings w on w.id = f.wedding_id
    where f.id = family_id and w.owner_id = auth.uid()))
  with check (exists (
    select 1 from public.families f join public.weddings w on w.id = f.wedding_id
    where f.id = family_id and w.owner_id = auth.uid()));

-- Informações só para padrinhos (fora da tabela weddings, que é pública).
create table if not exists public.wedding_party_info (
  wedding_id uuid primary key references public.weddings(id) on delete cascade,
  message text not null default '',
  dress_code text not null default '',
  arrival text not null default '',
  rehearsal text not null default ''
);
alter table public.wedding_party_info enable row level security;
create policy "owner manages party info" on public.wedding_party_info for all
  using (exists (select 1 from public.weddings w where w.id = wedding_id and w.owner_id = auth.uid()))
  with check (exists (select 1 from public.weddings w where w.id = wedding_id and w.owner_id = auth.uid()));

-- Converte a família já cadastrada: responsável + acompanhantes a renomear.
insert into public.guests (family_id, name, position)
select f.id, case when n = 1 then f.head_name else 'Acompanhante ' || n end, n
from public.families f, generate_series(1, f.people_count) n
where not exists (select 1 from public.guests g where g.family_id = f.id);

-- O fluxo antigo não é mais usado.
drop table if exists public.rsvp_challenges;

-- Convite aberto pelo link: devolve só a própria família (ou null).
create or replace function public.guest_invite(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'family', jsonb_build_object(
      'name', f.name,
      'head_name', f.head_name,
      'is_wedding_party', f.is_wedding_party,
      'rsvp_note', f.rsvp_note,
      'responded_at', f.responded_at),
    'guests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name, 'age_group', g.age_group, 'rsvp_status', g.rsvp_status)
        order by g.position, g.created_at)
      from guests g where g.family_id = f.id), '[]'::jsonb),
    'party', case when f.is_wedding_party then (
      select jsonb_build_object(
        'message', p.message, 'dress_code', p.dress_code, 'arrival', p.arrival, 'rehearsal', p.rehearsal)
      from wedding_party_info p where p.wedding_id = f.wedding_id) end,
    'rsvp_deadline', w.rsvp_deadline)
  from families f join weddings w on w.id = f.wedding_id
  where length(p_token) >= 16 and f.access_token = p_token
$$;

-- Grava a resposta de cada pessoa da família dona do link.
create or replace function public.guest_rsvp(p_token text, p_answers jsonb, p_note text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  fam families;
  deadline date;
  v_yes integer;
  v_total integer;
  v_pending integer;
begin
  select * into fam from families where length(p_token) >= 16 and access_token = p_token;
  if not found then
    raise exception 'Convite não encontrado.';
  end if;

  select rsvp_deadline into deadline from weddings where id = fam.wedding_id;
  if deadline is not null and (now() at time zone 'America/Sao_Paulo')::date > deadline then
    raise exception 'O prazo para confirmar presença terminou. Fale com os noivos.';
  end if;

  update guests g set rsvp_status = a.status
  from jsonb_to_recordset(p_answers) as a(id uuid, status text)
  where g.id = a.id and g.family_id = fam.id and a.status in ('confirmed', 'declined');

  select count(*) filter (where rsvp_status = 'confirmed'),
         count(*) filter (where rsvp_status = 'pending'),
         count(*)
    into v_yes, v_pending, v_total
  from guests where family_id = fam.id;

  update families set
    rsvp_note = left(coalesce(p_note, ''), 1000),
    responded_at = now(),
    rsvp_status = case when v_yes > 0 then 'confirmed' when v_pending > 0 then 'pending' else 'declined' end
  where id = fam.id;

  insert into activity_log (wedding_id, kind, message) values (
    fam.wedding_id, 'rsvp',
    case when v_yes > 0 then fam.head_name || ' confirmou ' || v_yes || ' de ' || v_total || ' pessoa(s).'
         else fam.head_name || ' informou que a família não poderá ir.' end);
end
$$;

revoke execute on function public.guest_invite(text) from public;
revoke execute on function public.guest_rsvp(text, jsonb, text) from public;
grant execute on function public.guest_invite(text) to anon, authenticated;
grant execute on function public.guest_rsvp(text, jsonb, text) to anon, authenticated;
