-- Presentes: quantidade livre de links de lojas e imagem anexada.

alter table public.gifts
  add column if not exists links jsonb not null default '[]'::jsonb,
  add column if not exists image_path text not null default '';

-- Move os dois links antigos para a nova lista e remove as colunas fixas.
update public.gifts
set links = (
  select coalesce(jsonb_agg(url), '[]'::jsonb)
  from unnest(array[store_link_1, store_link_2]) as url
  where url <> ''
)
where links = '[]'::jsonb;

alter table public.gifts drop column if exists store_link_1, drop column if exists store_link_2;

-- Imagens dos presentes: leitura pública, envio só pelos noivos, na pasta do próprio casamento.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gift-images', 'gift-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- A exclusão pela API do Storage também precisa de permissão de leitura.
create policy "owner reads gift images" on storage.objects for select to authenticated
  using (
    bucket_id = 'gift-images'
    and (storage.foldername(name))[1] in (select id::text from public.weddings where owner_id = auth.uid()));

create policy "owner uploads gift images" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'gift-images'
    and (storage.foldername(name))[1] in (select id::text from public.weddings where owner_id = auth.uid()));

create policy "owner updates gift images" on storage.objects for update to authenticated
  using (
    bucket_id = 'gift-images'
    and (storage.foldername(name))[1] in (select id::text from public.weddings where owner_id = auth.uid()));

create policy "owner deletes gift images" on storage.objects for delete to authenticated
  using (
    bucket_id = 'gift-images'
    and (storage.foldername(name))[1] in (select id::text from public.weddings where owner_id = auth.uid()));
