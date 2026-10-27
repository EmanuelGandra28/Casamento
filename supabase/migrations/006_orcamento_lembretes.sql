-- Orçamento completo (contratado, observações, link do contrato e teto geral)
-- e histórico de convite e lembretes enviados para cada família.

alter table public.budget_items
  add column if not exists contracted numeric(12, 2) not null default 0,
  add column if not exists notes text not null default '',
  add column if not exists link text not null default '';

-- weddings é pública; o teto do orçamento fica numa tabela só dos noivos.
create table if not exists public.wedding_private (
  wedding_id uuid primary key references public.weddings(id) on delete cascade,
  budget_total numeric(12, 2) not null default 0
);
alter table public.wedding_private enable row level security;
create policy "owner manages private settings" on public.wedding_private for all
  using (exists (select 1 from public.weddings w where w.id = wedding_id and w.owner_id = auth.uid()))
  with check (exists (select 1 from public.weddings w where w.id = wedding_id and w.owner_id = auth.uid()));

alter table public.families
  add column if not exists invite_sent_at timestamptz,
  add column if not exists reminded_at timestamptz,
  add column if not exists reminder_count integer not null default 0;
