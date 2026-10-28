-- Só pode existir um casamento no banco. Mesmo que alguém crie uma conta,
-- não consegue cadastrar outro casamento (e, sem casamento, não acessa nada).
-- Política restritiva: soma-se (E) às demais regras de inserção.
create policy "only one wedding" on public.weddings
  as restrictive for insert
  with check (not exists (select 1 from public.weddings));
