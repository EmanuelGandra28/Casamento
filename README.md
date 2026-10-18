# App do Casamento

Site responsivo para noivos e convidados, publicado no GitHub Pages e conectado ao Supabase. Convidados, RSVP, presentes, orçamento e atualizações ficam em uma base compartilhada.

## Publicar pela primeira vez

1. Crie um projeto em [Supabase](https://supabase.com/dashboard).
2. No **SQL Editor**, execute `supabase/schema.sql`.
3. Em **Authentication > Providers > Email**, mantenha e-mail/senha ativo. Confirme o e-mail criado pelos noivos ou desative temporariamente a confirmação para o primeiro acesso.
4. Em **Project Settings > API**, copie a **Project URL** e a chave **anon/public publishable**. Nunca use a chave `service_role` no site.
5. No GitHub, abra **Settings > Secrets and variables > Actions** e crie os segredos `SUPABASE_URL` e `SUPABASE_ANON_KEY`.
6. Em **Settings > Pages**, escolha **GitHub Actions** como fonte de publicação.
7. Envie a branch `main`. O site será publicado em `https://emanuelgandra28.github.io/Casamento/`.

O workflow gera `config.js` durante a publicação. Para testar no computador, preencha manualmente `config.js` com os mesmos valores públicos.

## RSVP em duas etapas por WhatsApp

`supabase/functions/guest-access/index.ts` é a função protegida que valida PIN e responsável, cria um código de seis dígitos e grava a confirmação. Publique-a no Supabase como Edge Function e configure estes segredos lá:

- `WHATSAPP_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_TEMPLATE_NAME`

O modelo de mensagem do WhatsApp deve receber o código como primeiro parâmetro do corpo. Sem esses segredos, o app não libera RSVP e não expõe dados de famílias.

## Segurança

- Orçamento, famílias, telefones e PINs só podem ser vistos pelos noivos autenticados.
- O site público lê somente a cerimônia e a lista de presentes.
- O RSVP passa pela Edge Function; convidados não acessam tabelas privadas.
- A chave `service_role` fica apenas nos segredos da função, nunca no GitHub Pages.

## Desenvolvimento local

Execute `npm start` e abra `http://localhost:4173`. Para testar no celular na mesma rede, use o IPv4 do computador com a porta `4173`.
