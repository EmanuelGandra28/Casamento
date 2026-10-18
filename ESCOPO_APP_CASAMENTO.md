# App do Casamento — Escopo inicial

## Propósito

Criar um app elegante e simples para organizar o casamento de Thallyta e Emanuel e concentrar as informações importantes para os convidados. A experiência deve se inspirar em plataformas como Wedy, mas ser personalizada para o casal e focada em casamento sem recepção/festa com mesas.

## Perfis de acesso

- **Noivos:** acessam a gestão de convidados, indicadores, orçamento, configurações e a lista de presentes.
- **Convidados:** acessam as informações do casamento, sua própria confirmação de presença e a lista de presentes.

## Entrada e acesso

### Tela de login

- A primeira tela do app apresenta duas opções: **Sou noivo(a)** e **Sou convidado(a)**.
- Noivos acessam com credenciais administrativas.
- Convidados acessam em duas etapas: primeiro informam o código de quatro dígitos da família e depois confirmam a identidade do responsável pelo núcleo familiar.
- A segunda confirmação pode ser o nome do responsável pela família e, quando disponível, um código de verificação enviado ao seu telefone ou e-mail.
- O acesso do convidado mostra somente o seu núcleo familiar, seus acompanhantes autorizados e as informações públicas do casamento.

### Código da família

- Cada família ou núcleo de convidados recebe um código numérico único de quatro dígitos.
- Cada núcleo tem um campo obrigatório de **responsável pela família**, que será o contato principal para confirmação e comunicações.
- O código é criado e gerenciado na área privada dos noivos.
- A mensagem de convite inclui nome do responsável pela família, link do casamento e o respectivo código de acesso.
- O código pode ser regenerado pelos noivos quando necessário.

## Funcionalidades da primeira versão

### 1. Início / Dashboard dos noivos

- Nome dos noivos e imagem de capa.
- Data, horário e local do casamento.
- Contagem regressiva até o grande dia.
- Indicadores de convidados: total, confirmados, pendentes e não irão.
- Resumo por origem de convidado.
- Atalhos para convidados, presentes e informações públicas.
- Central de atualizações no canto superior direito, com histórico de eventos importantes.

#### Central de atualizações

- Ao clicar no ícone de atualizações, os noivos visualizam a lista de novidades em ordem cronológica.
- Cada item informa o que ocorreu, quando ocorreu e um atalho para a área relacionada.
- Exemplos: confirmação ou recusa de presença, nova mensagem, presente escolhido, pagamento próximo do vencimento e gasto acima do orçamento.
- Atualizações podem ser marcadas como lidas.

### 2. Convidados — área privada dos noivos

- Cadastro de nome, origem, faixa etária, telefone, e-mail e observações.
- Busca e filtros.
- Status de convite e confirmação de presença.
- Cadastro de acompanhantes quando aplicável.
- Organização de convidados por família ou núcleo, com código individual de quatro dígitos e definição do responsável pela família.
- Sem gestão de mesas, lugares ou recepção.

#### Fluxo de convite e confirmação

- Convite digital com QR Code e link compartilhável.
- Link individual de RSVP para cada convidado ou núcleo familiar.
- Abertura do link já reconhece o convidado e exibe somente os acompanhantes autorizados.
- Código da família e nome do responsável incluídos na mensagem de convite.
- Lembretes por WhatsApp para convidados pendentes, enviados manualmente pelos noivos ou programados.
- Histórico de convite e lembrete enviado para evitar comunicações duplicadas.

#### Origens de convidados da planilha

1. Amigo(a) da Noiva
2. Amigo(a) do Noivo
3. Amigo(a) do casal
4. Colega de trabalho do Noivo
5. Colega de trabalho da Noiva
6. Convidado(a) dos pais da noiva
7. Convidado(a) dos pais do noivo
8. Família Noiva
9. Família Noivo

> A planilha fonte contém nove categorias de convidados além do cabeçalho. A lista acima preserva as categorias identificadas para uso no app.

### 3. Informações do casamento — área para convidados

- Mensagem de boas-vindas.
- Data, horário, endereço e mapa.
- Confirmação de presença (RSVP).
- Perguntas frequentes: chegada, estacionamento, crianças, contatos e outras orientações relevantes.
- Contagem regressiva.

### 4. Dress code

- Nome do traje definido pelo casal.
- Explicação curta e acolhedora sobre o que vestir.
- Paleta de cores sugerida e cores a evitar, se desejado.
- Referências visuais para inspirações de looks.
- Orientações práticas conforme o local: por exemplo, calçado apropriado para gramado, praia ou cerimônia religiosa.

### 5. Lista de presentes

- Itens com foto, descrição, valor e até dois links para lojas.
- Lista organizada por categorias, como casa, cozinha e lua de mel.
- Presentes únicos e presentes divididos em cotas.
- Contribuição livre, se os noivos desejarem.
- Status de item escolhido para impedir duplicidade.
- Ações de editar e excluir em cada presente, disponíveis somente aos noivos.
- Os links de lojas funcionam como alternativa ao presente em dinheiro: o convidado pode comprar o item diretamente na loja de sua preferência.

### 6. Orçamento e planejamento — área privada dos noivos

- Visão geral do orçamento: valor planejado, contratado, pago e saldo restante.
- Categorias de gastos, como cerimônia, vestuário, fotografia, decoração, música, transporte, convites e lua de mel.
- Cadastro de cada item com fornecedor, valor orçado, valor contratado, valor pago, vencimento, status e observações.
- Comparação entre orçamento previsto e gasto real por categoria.
- Controle de pagamentos: pendente, parcial e quitado.
- Alertas de vencimentos próximos e de gastos acima do orçamento definido.
- Anexos ou links para propostas, contratos e comprovantes, se desejado.
- Indicadores no dashboard: próximos pagamentos, itens sem orçamento e valor ainda disponível.
- Exportação dos dados para planilha.

## Fora do escopo inicial

- Mesas, lugares marcados e mapa de assentos.
- Gestão completa de buffet, recepção ou fornecedores.
- Checklist completo de produção do evento.

## Direção de experiência

- Visual afetivo, refinado e personalizado com a identidade do casal.
- Navegação objetiva para que convidados resolvam tudo em poucos passos.
- Privacidade clara entre área administrativa dos noivos e conteúdo público.
- Conteúdo centralizado em um único link compartilhável, inspirado na proposta de site de casamento da Wedy.

## Personalização e configurações — área privada dos noivos

O app deve iniciar sem dados pré-preenchidos para o casamento. Antes de publicar o convite, os noivos configuram toda a identidade e as informações do evento.

### Temas

- Galeria de temas para os noivos escolherem, inspirada na experiência de personalização da Wedy.
- Cada tema oferece combinações de layout, fontes, imagens e estilo de botões.
- Os noivos podem selecionar uma cor principal e uma cor secundária.
- Possibilidade de definir cor de fundo, imagem de fundo ou imagem de capa.
- Prévia em tempo real da página do casamento antes de salvar ou publicar.

### Informações editáveis

- Nome dos noivos e nomes curtos de exibição.
- Data, horário, endereço e mapa da cerimônia.
- Texto de boas-vindas, história do casal e perguntas frequentes.
- Dress code, paleta sugerida e orientações ao convidado.
- Tipografia dos títulos e dos textos.
- Imagens de capa, álbum e referências visuais.
- Configurações de visibilidade das páginas, RSVP e lista de presentes.
- Contatos dos noivos ou pessoa responsável pelo casamento.

## Próxima etapa

Definir a identidade visual e transformar este escopo em telas do app.

## Referências pesquisadas e ideias selecionadas

### Casar.com

Ideias adotadas:

- Página do casal altamente personalizável, com fotos, cores e tipografia da identidade do casamento.
- Dress code com referências visuais e orientações de traje.
- Mapas e rotas para o local.
- Mural de recados para convidados deixarem mensagens de carinho.
- Convite digital e save the date prontos para compartilhar pelo WhatsApp.

### Planning Wedding

Ideias adotadas:

- Campos personalizados no RSVP, como restrição alimentar ou necessidade de acessibilidade, apenas se fizer sentido para o casal.
- Linha do tempo simples do dia: chegada, início da cerimônia e encerramento.
- Colaboração privada entre os noivos e, se desejarem, uma pessoa de confiança.

Ideias deliberadamente fora do escopo:

- Mapa de mesas, lugares marcados, orçamento e diretório de fornecedores.

### Lejour

Ideias adotadas:

- Painel dos noivos com atualizações em tempo real: nova confirmação e presente escolhido.
- Lembretes de RSVP por WhatsApp para quem ainda não respondeu.
- Galeria colaborativa pós-casamento, na qual convidados podem enviar fotos e vídeos.

### Casamentos.com.br

Ideias adotadas:

- Área de inspirações visuais para o dress code, separando referências femininas e masculinas quando útil.
- Convite digital como ponto de entrada para o site, com acesso pelo link ou QR Code.

Ideias deliberadamente fora do escopo:

- Busca e contratação de fornecedores, orçamento, agenda de produção e mesas.

### iCasei

Ideias adotadas:

- Um único endereço compartilhável, reunindo convite, informações, mapa, dress code, RSVP e presentes.
- Formulário de RSVP com acompanhantes autorizados e faixas etárias.
- Mural de mensagens moderável pelos noivos.
- Atalho de QR Code no convite impresso ou digital.
- Página "Nossa história" e álbum do casal como conteúdo opcional e afetivo.

## Prioridades consolidadas

### Essencial na primeira versão

- Dashboard privado dos noivos.
- Gestão de convidados por origem, com RSVP e acompanhantes.
- Página pública do casamento com mapa, orientações e dress code.
- Lista de presentes.
- Convite digital com link e QR Code.
- Link individual de RSVP e lembretes pelo WhatsApp.
- Orçamento e controle de pagamentos privado dos noivos.

### Segunda versão

- Lembretes por WhatsApp.
- Mural de mensagens.
- Galeria colaborativa de fotos e vídeos.
- Linha do tempo do dia.
- Página "Nossa história" e álbum de fotos.

## Decisão dos noivos

Todas as ideias selecionadas nas referências foram aprovadas para o produto. Elas serão incorporadas progressivamente, respeitando as prioridades abaixo.

## Ideias complementares

### Acesso e comunicação

- **Página protegida por senha opcional:** para manter fotos, endereço ou lista de presentes acessíveis somente a convidados.
- **Link individual de RSVP:** cada convite pode ter um link próprio, identificando o convidado e seus acompanhantes sem exigir cadastro.
- **Central de atualizações:** avisos breves publicados pelos noivos, como mudança de horário, previsão de chuva ou lembrete de chegada.
- **Compartilhamento simples:** botões para copiar o link, abrir no WhatsApp e salvar a data no calendário do celular.

### Informações úteis ao convidado

- **Previsão do tempo:** apresentar a previsão próxima ao evento e uma recomendação compatível com o local.
- **Acessibilidade:** campo dedicado para informar acesso de cadeirantes, elevador, estacionamento, banheiro e contato para necessidades especiais.
- **Como chegar:** mapa, rota por aplicativo, referência de entrada e orientações de estacionamento ou desembarque.
- **Perguntas frequentes dinâmicas:** respostas que os noivos podem editar sem precisar alterar o convite.

### Experiência afetiva

- **Linha do tempo do casal:** pequenos marcos e fotos, em uma página opcional chamada "Nossa história".
- **Contador de carinho:** número de mensagens, confirmações e fotos recebidas, exibido somente para os noivos.
- **Cartão de agradecimento pós-casamento:** mensagem personalizada com uma foto do casal e link para a galeria, enviada aos convidados após o evento.

### Gestão privada dos noivos

- **Relatório de RSVP por origem:** totais e porcentagens de confirmação em cada categoria da lista de convidados.
- **Exportação da lista:** baixar convidados e status de presença em planilha, quando necessário.
- **Histórico de contato:** registro de convite enviado e lembrete enviado, evitando abordagens duplicadas.
- **Modo cerimônia:** tela enxuta para consulta rápida de contatos importantes, lista de confirmados e informações do dia.

## Prioridades recomendadas após a primeira versão

1. Central de atualizações.
2. Acessibilidade, mapa detalhado e FAQ editável.
3. Mural de recados e galeria colaborativa.
4. Cartão de agradecimento e exportação de convidados.

## Fontes de inspiração

- https://wedy.com/
- https://www.casar.com/
- https://planning.wedding/pt
- https://lejour.com.br/
- https://www.casamentos.com.br/
- https://www.icasei.com.br/
