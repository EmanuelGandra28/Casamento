# App do Casamento

Site responsivo para noivos e convidados, publicado no GitHub Pages e conectado ao Supabase. Convidados, RSVP, presentes, orçamento e atualizações ficam em uma base compartilhada.

## Publicar pela primeira vez

1. Crie um projeto em [Supabase](https://supabase.com/dashboard).
2. No **SQL Editor**, execute `supabase/schema.sql` e depois os arquivos de `supabase/migrations/`, em ordem.
3. Em **Authentication > Providers > Email**, mantenha e-mail/senha ativo. Confirme o e-mail criado pelos noivos ou desative temporariamente a confirmação para o primeiro acesso.
4. Em **Project Settings > API**, copie a **Project URL** e a chave **anon/public publishable**. Nunca use a chave `service_role` no site.
5. No GitHub, abra **Settings > Secrets and variables > Actions** e crie os segredos `SUPABASE_URL` e `SUPABASE_ANON_KEY`.
6. Em **Settings > Pages**, escolha **GitHub Actions** como fonte de publicação.
7. Envie a branch `main`. O site será publicado em `https://emanuelgandra28.github.io/Casamento/`.

O workflow gera `config.js` durante a publicação. Para testar no computador, preencha manualmente `config.js` com os mesmos valores públicos.

## Convites e RSVP

Cada família recebe um link exclusivo (`.../Casamento/#c=<código>`), gerado automaticamente pelo banco. Na área dos noivos, o botão **Convite** de cada família mostra o link, envia a mensagem pelo WhatsApp e baixa o QR Code em PNG para convites impressos.

Quem abre o link vê somente a própria família e marca, pessoa por pessoa, quem vai ou não. Famílias marcadas como **Padrinhos e madrinhas** também veem as orientações cadastradas em **Configurações**. O RSVP é gravado pelas funções `guest_invite` e `guest_rsvp` do Postgres, que só aceitam o código do próprio link e respeitam o prazo configurado.

## Segurança

- Orçamento, famílias, pessoas, telefones e informações dos padrinhos só podem ser vistos pelos noivos autenticados.
- O site público lê somente a cerimônia e a lista de presentes.
- Convidados não acessam tabelas privadas: as funções do RSVP devolvem e alteram apenas a família dona do link.
- O site usa somente a chave pública do Supabase; nunca coloque a `service_role` no GitHub Pages.

## Desenvolvimento local

Instale o [Node.js](https://nodejs.org/) (versão LTS), execute `npm start` e abra `http://localhost:4173`. Para testar no celular na mesma rede, use o IPv4 do computador com a porta `4173`.
