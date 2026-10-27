-- Presentes com Pix: dados do recebedor, presentes em cotas e reserva para evitar duplicidade.

-- Chave Pix dos noivos. É pública de propósito: os convidados precisam dela para pagar.
alter table public.weddings
  add column if not exists pix_key text not null default '',
  add column if not exists pix_key_type text not null default 'random'
    check (pix_key_type in ('cpf', 'cnpj', 'phone', 'email', 'random')),
  add column if not exists pix_name text not null default '',
  add column if not exists pix_city text not null default '';

-- item: presente único comprado na loja. quota: valor dividido em cotas pagas por Pix.
-- taken é mantido pelo gatilho abaixo e mostra a todos o que já foi escolhido.
alter table public.gifts
  add column if not exists kind text not null default 'item' check (kind in ('item', 'quota')),
  add column if not exists quota_total integer not null default 1 check (quota_total > 0),
  add column if not exists taken integer not null default 0;

create table if not exists public.gift_reservations (
  id uuid primary key default gen_random_uuid(),
  gift_id uuid not null references public.gifts(id) on delete cascade,
  family_id uuid references public.families(id) on delete cascade,
  quantity integer not null default 1 check (quantity > 0),
  message text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists gift_reservations_gift_id_idx on public.gift_reservations(gift_id);
alter table public.gift_reservations enable row level security;
create policy "owner manages reservations" on public.gift_reservations for all
  using (exists (
    select 1 from public.gifts g join public.weddings w on w.id = g.wedding_id
    where g.id = gift_id and w.owner_id = auth.uid()))
  with check (exists (
    select 1 from public.gifts g join public.weddings w on w.id = g.wedding_id
    where g.id = gift_id and w.owner_id = auth.uid()));

create or replace function public.sync_gift_taken()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update gifts set taken = (
    select coalesce(sum(quantity), 0) from gift_reservations where gift_id = gifts.id)
  where id = coalesce(new.gift_id, old.gift_id);
  return null;
end
$$;

drop trigger if exists gift_reservations_sync on public.gift_reservations;
create trigger gift_reservations_sync
after insert or update or delete on public.gift_reservations
for each row execute function public.sync_gift_taken();

-- Convidado escolhe um presente (ou cotas) pelo link do convite.
create or replace function public.reserve_gift(p_token text, p_gift uuid, p_quantity integer default 1, p_message text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  fam families;
  g gifts;
  v_qty integer;
  v_limit integer;
  v_id uuid;
begin
  select * into fam from families where length(p_token) >= 16 and access_token = p_token;
  if not found then
    raise exception 'Use o link do seu convite para escolher um presente.';
  end if;

  -- Trava o presente para dois convidados não escolherem a mesma coisa ao mesmo tempo.
  select * into g from gifts where id = p_gift and wedding_id = fam.wedding_id for update;
  if not found then
    raise exception 'Presente não encontrado.';
  end if;

  v_qty := case when g.kind = 'item' then 1 else greatest(1, coalesce(p_quantity, 1)) end;
  v_limit := case when g.kind = 'item' then 1 else g.quota_total end;
  if g.taken + v_qty > v_limit then
    if g.kind = 'item' then
      raise exception 'Este presente já foi escolhido por outro convidado.';
    end if;
    raise exception 'Restam apenas % cota(s) deste presente.', greatest(v_limit - g.taken, 0);
  end if;

  insert into gift_reservations (gift_id, family_id, quantity, message)
  values (g.id, fam.id, v_qty, left(coalesce(p_message, ''), 500))
  returning id into v_id;

  insert into activity_log (wedding_id, kind, message) values (
    fam.wedding_id, 'gift',
    case when g.kind = 'item' then fam.name || ' escolheu o presente ' || g.name || '.'
         else fam.name || ' reservou ' || v_qty || ' cota(s) de ' || g.name || '.' end);

  return jsonb_build_object('id', v_id, 'quantity', v_qty);
end
$$;

-- Convidado desiste da própria escolha.
create or replace function public.cancel_gift_reservation(p_token text, p_reservation uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  fam families;
  v_gift text;
begin
  select * into fam from families where length(p_token) >= 16 and access_token = p_token;
  if not found then
    raise exception 'Convite não encontrado.';
  end if;
  delete from gift_reservations r using gifts g
  where r.id = p_reservation and r.family_id = fam.id and g.id = r.gift_id
  returning g.name into v_gift;
  if v_gift is null then
    raise exception 'Reserva não encontrada.';
  end if;
  insert into activity_log (wedding_id, kind, message)
  values (fam.wedding_id, 'gift', fam.name || ' desistiu do presente ' || v_gift || '.');
end
$$;

-- O convite passa a incluir as reservas da própria família.
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
    'reservations', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'gift_id', r.gift_id, 'quantity', r.quantity))
      from gift_reservations r where r.family_id = f.id), '[]'::jsonb),
    'rsvp_deadline', w.rsvp_deadline)
  from families f join weddings w on w.id = f.wedding_id
  where length(p_token) >= 16 and f.access_token = p_token
$$;

revoke execute on function public.reserve_gift(text, uuid, integer, text) from public;
revoke execute on function public.cancel_gift_reservation(text, uuid) from public;
revoke execute on function public.sync_gift_taken() from public;
grant execute on function public.reserve_gift(text, uuid, integer, text) to anon, authenticated;
grant execute on function public.cancel_gift_reservation(text, uuid) to anon, authenticated;
