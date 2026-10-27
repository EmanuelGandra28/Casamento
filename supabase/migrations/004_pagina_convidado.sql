-- Página do convidado: perguntas frequentes, dress code visual e orientações de chegada.
-- Ficam em weddings, que já é pública, porque são informações para todos os convidados.

alter table public.weddings
  add column if not exists faq jsonb not null default '[]'::jsonb,
  add column if not exists dress_palette jsonb not null default '[]'::jsonb,
  add column if not exists dress_avoid jsonb not null default '[]'::jsonb,
  add column if not exists dress_tips text not null default '',
  add column if not exists arrival_notes text not null default '';
