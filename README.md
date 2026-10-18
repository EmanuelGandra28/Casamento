# App do Casamento

Aplicação web responsiva para noivos e convidados. No primeiro acesso, ela começa sem informações: os noivos criam o acesso e preenchem os dados em **Configurações**.

## Rodar como aplicativo web

No diretório do projeto, execute:

```powershell
npm start
```

Depois abra `http://localhost:4173` no computador. Para abrir no celular na mesma rede Wi-Fi, use o endereço IPv4 do computador com a porta `4173`, por exemplo: `http://192.168.0.10:4173`.

Abrir o `index.html` diretamente não é a forma recomendada. O servidor incluído garante que todos os arquivos sejam carregados corretamente.

## Fluxos disponíveis

- Configuração inicial em branco.
- Login dos noivos com senha definida no primeiro acesso.
- Login do convidado em duas etapas: PIN da família e responsável pela família. O código `123456` é a simulação local da verificação enviada por mensagem.
- Famílias com PIN exclusivo de quatro dígitos e mensagem de convite preparada para WhatsApp.
- Cadastro e edição de convidados, lista de presentes e orçamento.
- Presentes com até dois links de lojas, edição e exclusão.
- Temas, cores principal/secundária, fonte e imagem de fundo.
- Central de atualizações com RSVP, orçamento e alterações recentes.

## Publicação por link público

O projeto está pronto para uma hospedagem estática. Para um link acessível fora da rede local, publique os arquivos em um serviço como Netlify, Vercel, Cloudflare Pages ou GitHub Pages. Essa etapa exige a conta do serviço escolhido.

> Esta versão armazena dados somente no navegador. Para uso real por todos os convidados, é necessário conectar um banco de dados, autenticação segura e um provedor de WhatsApp/e-mail para enviar o segundo fator.
