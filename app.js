const cfg = window.APP_CONFIG || {}
const on = !!(cfg.supabaseUrl && cfg.supabaseAnonKey)
const sb = on ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null

const $ = (s) => document.querySelector(s)
const esc = (v) =>
  String(v ?? '').replace(
    /[&<>'"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c],
  )
const safeUrl = (v) => (/^https?:\/\//i.test(String(v ?? '')) ? v : '')
const cash = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(+v || 0)
// Datas do banco vêm como "AAAA-MM-DD"; meio-dia local evita voltar um dia por causa do fuso.
const localDate = (v) => new Date(v + 'T12:00')
const dt = (v) => (v ? localDate(v).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' }) : 'A definir')

// W: casamento, G: presentes, F: famílias (com .guests), B: orçamento, A: atualizações,
// P: informações dos padrinhos, U: usuário logado, invite: convite aberto pelo link.
let W
let G = []
let F = []
let B = []
let A = []
let P = {}
let U
let view = 'home'
let guestFilter = 'all'
let invite = null

const VIEWS = {
  home: 'Visão geral',
  guests: 'Convidados',
  gifts: 'Lista de presentes',
  budget: 'Orçamento',
  settings: 'Configurações',
}

const AGE_GROUPS = { adult: 'Adulto', child: 'Criança', baby: 'Bebê' }
const RSVP_LABELS = { confirmed: 'Confirmado', declined: 'Não irá', pending: 'Pendente' }
const ORIGINS = [
  'Amigo(a) da Noiva',
  'Amigo(a) do Noivo',
  'Amigo(a) do casal',
  'Colega de trabalho do Noivo',
  'Colega de trabalho da Noiva',
  'Convidado(a) dos pais da noiva',
  'Convidado(a) dos pais do noivo',
  'Família Noiva',
  'Família Noivo',
]
const TOKEN_KEY = 'casamento:convite'
const GIFT_BUCKET = 'gift-images'
const STORES = [
  [/amazon\.|amzn\./i, 'Amazon'],
  [/mercadoli[vb]re\.|meli\.la/i, 'Mercado Livre'],
  [/shopee\./i, 'Shopee'],
]

// Nome da loja exibido no botão: lojas conhecidas pelo nome, as demais pelo domínio.
function storeName(url) {
  const known = STORES.find(([pattern]) => pattern.test(url))
  if (known) return known[1]
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'Loja'
  }
}

const giftImageUrl = (path) => (path ? sb.storage.from(GIFT_BUCKET).getPublicUrl(path).data.publicUrl : '')

// Reduz a foto para no máximo `max` px e JPEG, para carregar rápido no celular.
async function shrinkImage(file, max = 1200) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
}

async function removeGiftImage(path) {
  if (!path) return
  const r = await sb.storage.from(GIFT_BUCKET).remove([path])
  if (r.error) console.warn('Imagem antiga não removida:', r.error.message)
}

const siteUrl = () => cfg.siteUrl || location.origin + location.pathname
const inviteLink = (f) => `${siteUrl()}#c=${f.access_token}`
const allGuests = () => F.flatMap((f) => f.guests)

// Link do convite (#c=...) tem prioridade; sem ele, usa o último convite aberto neste aparelho.
function inviteToken() {
  const fromLink = new URLSearchParams(location.hash.slice(1)).get('c')
  try {
    if (fromLink) localStorage.setItem(TOKEN_KEY, fromLink)
    return { token: fromLink || localStorage.getItem(TOKEN_KEY), fromLink: !!fromLink }
  } catch {
    return { token: fromLink, fromLink: !!fromLink }
  }
}

function forgetInvite() {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {}
}

async function loadInvite(token) {
  if (!token) return null
  const r = await sb.rpc('guest_invite', { p_token: token })
  if (r.error) throw r.error
  if (!r.data) forgetInvite()
  return r.data ? { ...r.data, token } : null
}

function app(x) {
  $('#app').innerHTML = x
}

function toast(x) {
  const e = $('#toast')
  e.textContent = x
  e.classList.add('show')
  clearTimeout(toast.t)
  toast.t = setTimeout(() => e.classList.remove('show'), 2800)
}

function bad(e) {
  console.error(e)
  toast(e?.message || 'Não foi possível concluir agora.')
}

function closeModal() {
  $('#modal')?.remove()
}

function pop(x) {
  closeModal()
  $('#app').insertAdjacentHTML(
    'beforeend',
    `<div class="modal-bg" id="modal"><div class="modal"><button class="close" id="close">×</button><div id="modalBody">${x}</div></div></div>`,
  )
  $('#close').onclick = closeModal
  $('#modal').onclick = (e) => {
    if (e.target.id === 'modal') closeModal()
  }
}

function paint() {
  if (!W) return
  const root = document.documentElement.style
  root.setProperty('--p', W.primary_color)
  root.setProperty('--s', W.secondary_color)
  root.setProperty('--title', W.title_font === 'Montserrat' ? 'Montserrat,sans-serif' : '"Playfair Display",serif')
  document.title = `${W.bride} & ${W.groom} — Casamento`
}

async function boot() {
  if (!on) return connect()
  const r = await sb.from('weddings').select('*').order('created_at').limit(1).maybeSingle()
  W = r.data
  const a = await sb.auth.getUser()
  U = a.data.user
  paint()
  const { token, fromLink } = inviteToken()
  if (W && fromLink) return openInvite(token)
  if (U && W?.owner_id === U.id) return owner()
  if (W) return openInvite(token)
  setup()
}

async function openInvite(token) {
  invite = await loadInvite(token)
  if (token && !invite && location.hash.includes('c=')) toast('Convite não encontrado. Confira o link recebido.')
  return publicPage()
}

function connect() {
  app(`<section class="setup"><div class="setup-inner">
    <p class="eyebrow">Conexão necessária</p>
    <h1>Conecte o Supabase.</h1>
    <p>Adicione a URL e a chave pública do seu projeto no arquivo <b>config.js</b>. Assim, convidados e noivos verão os mesmos dados pelo link público.</p>
    <div class="panel"><p>Nenhum dado fica salvo apenas neste navegador.</p></div>
  </div></section>`)
}

function setup() {
  app(`<section class="setup"><div class="setup-inner">
    <p class="eyebrow">Primeiro acesso</p>
    <h1>Vamos criar o casamento.</h1>
    <p>Crie a conta privada dos noivos. Os detalhes podem ser preenchidos depois.</p>
    <div class="panel">
      <form class="form" id="setup">
        <div class="two">
          <label>Nome da noiva<input name="bride" required></label>
          <label>Nome do noivo<input name="groom" required></label>
        </div>
        <label>E-mail dos noivos<input name="email" type="email" required></label>
        <div class="two">
          <label>Senha<input name="password" type="password" minlength="8" required></label>
          <label>Confirmar senha<input name="confirm" type="password" minlength="8" required></label>
        </div>
        <button class="btn primary">Criar casamento</button>
      </form>
      <button class="back" id="existing">Já confirmei meu e-mail — entrar</button>
    </div>
  </div></section>`)
  $('#existing').onclick = login
  $('#setup').onsubmit = async (e) => {
    e.preventDefault()
    const d = Object.fromEntries(new FormData(e.target))
    if (d.password !== d.confirm) return toast('As senhas precisam ser iguais.')
    if (!U) {
      const r = await sb.auth.signUp({ email: d.email, password: d.password })
      if (r.error) return bad(r.error)
      if (!r.data.session) return toast('Confirme o e-mail e use “Já confirmei meu e-mail — entrar”.')
      U = r.data.user
    }
    const w = await sb.from('weddings').insert({ owner_id: U.id, bride: d.bride, groom: d.groom }).select().single()
    if (w.error) return bad(w.error)
    W = w.data
    await log('settings', 'O casamento foi criado.')
    owner()
  }
}

function login() {
  pop(`<p class="eyebrow">Área dos noivos</p>
    <h2>Entrar</h2>
    <form class="form" id="login">
      <label>E-mail<input name="email" type="email" required></label>
      <label>Senha<input name="password" type="password" required></label>
      <button class="btn primary">Entrar</button>
    </form>`)
  $('#login').onsubmit = async (e) => {
    e.preventDefault()
    const d = Object.fromEntries(new FormData(e.target))
    const r = await sb.auth.signInWithPassword(d)
    if (r.error) return bad(r.error)
    U = r.data.user
    closeModal()
    if (!W) return setup()
    owner()
  }
}

async function owner() {
  const [f, g, b, a, p] = await Promise.all([
    sb.from('families').select('*, guests(*)').eq('wedding_id', W.id).order('created_at', { ascending: false }),
    sb.from('gifts').select('*').eq('wedding_id', W.id).order('created_at', { ascending: false }),
    sb.from('budget_items').select('*').eq('wedding_id', W.id).order('due_date'),
    sb.from('activity_log').select('*').eq('wedding_id', W.id).order('created_at', { ascending: false }).limit(30),
    sb.from('wedding_party_info').select('*').eq('wedding_id', W.id).maybeSingle(),
  ])
  const failed = [f, g, b, a, p].find((r) => r.error)
  if (failed) bad(failed.error)
  F = (f.data || []).map((x) => ({ ...x, guests: (x.guests || []).sort((m, n) => m.position - n.position) }))
  G = g.data || []
  B = b.data || []
  A = a.data || []
  P = p.data || {}
  admin()
}

async function log(kind, message) {
  const r = await sb.from('activity_log').insert({ wedding_id: W.id, kind, message })
  if (r.error) console.warn('Histórico não registrado:', r.error.message)
}

async function out() {
  await sb.auth.signOut()
  U = null
  boot()
}

async function publicPage() {
  const r = await sb.from('gifts').select('*').eq('wedding_id', W.id).order('created_at')
  G = r.data || []
  paint()
  const bg = W.background_url
    ? `style="background-image:linear-gradient(#fbfaf7df,#fbfaf7df),url('${esc(safeUrl(W.background_url))}')"`
    : ''
  const when = W.event_date
    ? dt(W.event_date) + (W.event_time ? ' às ' + W.event_time.slice(0, 5) : '')
    : 'Em breve, todos os detalhes.'
  const answered = invite?.guests.some((g) => g.rsvp_status !== 'pending')
  const cta = invite
    ? `<button id="guest" class="btn primary">${answered ? 'Ver ou alterar resposta' : 'Confirmar presença'}</button>
       ${answered ? `<p class="note">${rsvpSummary(invite.guests)}</p>` : ''}`
    : '<p class="note">Para confirmar presença, use o link enviado no seu convite.</p>'
  app(`<div class="public" ${bg}>
    <nav class="public-nav"><b>${esc(W.bride)} & ${esc(W.groom)}</b><button id="admin">Área dos noivos</button></nav>
    <section class="public-hero">
      <p class="eyebrow">${invite ? `Convite para ${esc(invite.family.name)}` : 'Nosso casamento'}</p>
      <h1>${esc(W.bride)}<br>& ${esc(W.groom)}</h1>
      <p>${when}</p>
      ${cta}
    </section>
    ${invite?.family.is_wedding_party ? partySection(invite.party || {}) : ''}
    <section class="public-section">
      <p class="eyebrow">O grande dia</p>
      <h2>Informações para você</h2>
      <div class="info">
        <article><h3>Quando</h3><p>${dt(W.event_date)}<br>${W.event_time ? W.event_time.slice(0, 5) : ''}</p></article>
        <article><h3>Onde</h3><p>${esc(W.location || 'Local a definir')}<br>${esc(W.address)}</p></article>
        <article><h3>Dress code</h3><p>${esc(W.dress_code || 'Em breve, os noivos compartilharão as orientações.')}</p></article>
      </div>
    </section>
    <section class="public-section">
      <p class="eyebrow">Lista de presentes</p>
      <h2>Com carinho</h2>
      <div class="grid">${G.map((g) => giftCard(g)).join('') || '<p class="empty">A lista será publicada em breve.</p>'}</div>
    </section>
    <footer class="footer">Feito com carinho para celebrar um novo capítulo.</footer>
  </div>`)
  $('#admin').onclick = () => (U && W.owner_id === U.id ? owner() : login())
  if (invite) $('#guest').onclick = rsvp
}

function rsvpSummary(guests) {
  const yes = guests.filter((g) => g.rsvp_status === 'confirmed').length
  if (!yes) return 'Vocês informaram que não poderão ir. Sentiremos sua falta!'
  return `Presença confirmada para ${yes} de ${guests.length} pessoa(s). Até lá!`
}

function partySection(p) {
  const items = [
    ['Recado dos noivos', p.message],
    ['Traje dos padrinhos', p.dress_code],
    ['Chegada', p.arrival],
    ['Ensaio', p.rehearsal],
  ].filter(([, text]) => text)
  return `<section class="public-section party">
    <p class="eyebrow">Padrinhos e madrinhas</p>
    <h2>Para vocês, com carinho</h2>
    <div class="info">${
      items.map(([title, text]) => `<article><h3>${title}</h3><p>${esc(text).replace(/\n/g, '<br>')}</p></article>`).join('') ||
      '<p class="empty">Em breve, os noivos compartilharão as orientações para padrinhos.</p>'
    }</div>
  </section>`
}

function giftCard(g, manage = false) {
  const urls = (g.links || []).map(safeUrl).filter(Boolean)
  const links = urls.length
    ? `<div class="links">${urls
        .map((u) => `<a class="store" target="_blank" rel="noopener" href="${esc(u)}">${esc(storeName(u))} ↗</a>`)
        .join('')}</div>`
    : ''
  const actions = manage
    ? `<div class="actions"><button class="act" data-eg="${g.id}">Editar</button><button class="act" data-dg="${g.id}">Excluir</button></div>`
    : ''
  const picture = g.image_path
    ? `<img class="gift-img" src="${esc(giftImageUrl(g.image_path))}" alt="${esc(g.name)}" loading="lazy">`
    : `<div class="emoji">${esc(g.icon || '🎁')}</div>`
  return `<article class="gift">
    ${picture}
    <h3>${esc(g.name)}</h3>
    <p>${esc(g.description)}</p>
    <b>${cash(g.price)}</b>${links}${actions}
  </article>`
}

function admin() {
  paint()
  const nav = Object.entries(VIEWS)
    .map(([k, label]) => `<button class="${view === k ? 'active' : ''}" data-v="${k}">${label}</button>`)
    .join('')
  app(`<div class="shell">
    <aside class="side" id="side">
      <div class="brand">${esc(W.bride)} <i>&</i> ${esc(W.groom)}</div>
      <nav class="nav">
        <small>Área dos noivos</small>${nav}
        <small>Site do casamento</small>
        <button id="public">Página pública</button>
        <button id="leave">Sair</button>
      </nav>
    </aside>
    <section class="content">
      <header class="top">
        <button class="mobile" id="menu">☰</button>
        <h1>${VIEWS[view]}</h1>
        <button class="bell ${A.length ? 'has' : ''}" id="bell">♢</button>
      </header>
      ${panel()}
    </section>
  </div>`)
  document.querySelectorAll('[data-v]').forEach(
    (b) =>
      (b.onclick = () => {
        view = b.dataset.v
        admin()
      }),
  )
  $('#menu').onclick = () => $('#side').classList.toggle('open')
  $('#public').onclick = publicPage
  $('#leave').onclick = out
  $('#bell').onclick = updates
  bind()
}

function panel() {
  if (view === 'guests') return guestPanel()
  if (view === 'gifts') return giftsPanel()
  if (view === 'budget') return budgetPanel()
  if (view === 'settings') return settingsPanel()
  const people = allGuests()
  const total = people.length
  const yes = people.filter((g) => g.rsvp_status === 'confirmed').length
  const no = people.filter((g) => g.rsvp_status === 'declined').length
  const due = B.reduce((n, b) => n + Number(b.amount) - Number(b.amount_paid), 0)
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const days = W.event_date ? Math.max(0, Math.round((localDate(W.event_date) - today) / 86400000)) : '—'
  const recent =
    A.slice(0, 6)
      .map(
        (a) =>
          `<div class="row"><span>${esc(a.message)}<small>${new Date(a.created_at).toLocaleString('pt-BR')}</small></span><b>Atualização</b></div>`,
      )
      .join('') || '<p class="empty">As atividades aparecerão aqui.</p>'
  const upcoming =
    B.filter((b) => +b.amount_paid < +b.amount)
      .slice(0, 4)
      .map(
        (b) =>
          `<div class="row"><span>${esc(b.name)}<small>${dt(b.due_date)}</small></span><b>${cash(+b.amount - b.amount_paid)}</b></div>`,
      )
      .join('') || '<p class="empty">Nenhum item cadastrado.</p>'
  return `<main class="page">
    <section class="hero">
      <div>
        <p class="eyebrow">${W.event_date ? dt(W.event_date) : 'Data ainda não definida'}</p>
        <h2>${esc(W.bride)} & ${esc(W.groom)}</h2>
        <p>${esc(W.location || 'Configure o local em Configurações.')}</p>
      </div>
      <div class="count"><b>${days}</b><span>dias para o casamento</span></div>
    </section>
    <section class="cards">
      <article class="card"><span>Convidados</span><strong>${total}</strong></article>
      <article class="card"><span>Confirmados</span><strong>${yes}</strong></article>
      <article class="card"><span>RSVP pendente</span><strong>${total - yes - no}</strong></article>
      <article class="card"><span>Pagamentos pendentes</span><strong>${cash(due)}</strong></article>
    </section>
    <section class="cols">
      <article class="panel"><h3>Atualizações recentes</h3>${recent}</article>
      <article class="panel"><h3>Próximos pagamentos</h3>${upcoming}</article>
    </section>
  </main>`
}

const GUEST_FILTERS = {
  all: ['Todos', () => true],
  party: ['Padrinhos', (f) => f.is_wedding_party],
  pending: ['Pendentes', (f) => f.guests.some((g) => g.rsvp_status === 'pending')],
}

function guestPanel() {
  const shown = F.filter(GUEST_FILTERS[guestFilter][1])
  const rows =
    shown
      .map((f) => {
        const yes = f.guests.filter((g) => g.rsvp_status === 'confirmed').length
        return `<tr>
        <td><b>${esc(f.name)}</b>${f.is_wedding_party ? '<span class="badge">Padrinhos</span>' : ''}<small>${f.guests
          .map((g) => esc(g.name))
          .join(', ')}</small></td>
        <td>${esc(f.head_name)}</td>
        <td>${yes} de ${f.guests.length}</td>
        <td>${esc(f.origin || '—')}</td>
        <td><span class="status ${f.rsvp_status}">${RSVP_LABELS[f.rsvp_status] || 'Pendente'}</span>${
          f.rsvp_note ? `<small>“${esc(f.rsvp_note)}”</small>` : ''
        }</td>
        <td><div class="actions">
          <button class="act" data-inv="${f.id}">Convite</button>
          <button class="act" data-ef="${f.id}">Editar</button>
          <button class="act" data-df="${f.id}">Excluir</button>
        </div></td>
      </tr>`
      })
      .join('') || '<tr><td colspan="6" class="empty">Nenhuma família encontrada.</td></tr>'
  const filters = Object.entries(GUEST_FILTERS)
    .map(([k, [label]]) => `<button class="${guestFilter === k ? 'active' : ''}" data-gf="${k}">${label}</button>`)
    .join('')
  return `<main class="page">
    <div class="head">
      <div>
        <p class="eyebrow">Famílias e RSVP</p>
        <h2>Convidados</h2>
        <p>Cada família recebe um link próprio para confirmar a presença de cada pessoa.</p>
      </div>
      <button class="btn primary" id="nf">+ Nova família</button>
    </div>
    <div class="toolbar">${filters}</div>
    <table class="table">
      <thead><tr><th>Família</th><th>Responsável</th><th>Confirmados</th><th>Origem</th><th>RSVP</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </main>`
}

function giftsPanel() {
  return `<main class="page">
    <div class="head">
      <div>
        <p class="eyebrow">Lista de presentes</p>
        <h2>Presentes</h2>
        <p>Adicione a foto e quantos links de lojas quiser (Amazon, Mercado Livre, Shopee...).</p>
      </div>
      <button class="btn primary" id="ng">+ Novo presente</button>
    </div>
    <div class="grid">${G.map((g) => giftCard(g, true)).join('') || '<p class="empty">A lista de presentes está vazia.</p>'}</div>
  </main>`
}

function budgetPanel() {
  const planned = B.reduce((n, b) => n + +b.amount, 0)
  const paid = B.reduce((n, b) => n + +b.amount_paid, 0)
  const rows =
    B.map(
      (b) => `<tr>
        <td><b>${esc(b.name)}</b><small>${esc(b.supplier)}</small></td>
        <td>${esc(b.category)}</td>
        <td>${dt(b.due_date)}</td>
        <td>${cash(b.amount)}</td>
        <td>${cash(b.amount_paid)}</td>
      </tr>`,
    ).join('') || '<tr><td colspan="5" class="empty">Nenhum item cadastrado.</td></tr>'
  return `<main class="page">
    <div class="head">
      <div><p class="eyebrow">Planejamento privado</p><h2>Orçamento</h2></div>
      <button class="btn primary" id="nb">+ Novo item</button>
    </div>
    <section class="cards">
      <article class="card"><span>Planejado</span><strong>${cash(planned)}</strong></article>
      <article class="card"><span>Pago</span><strong>${cash(paid)}</strong></article>
      <article class="card"><span>Restante</span><strong>${cash(planned - paid)}</strong></article>
    </section>
    <table class="table">
      <thead><tr><th>Item</th><th>Categoria</th><th>Vencimento</th><th>Valor</th><th>Pago</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </main>`
}

function settingsPanel() {
  const font = (name) => `<option ${W.title_font === name ? 'selected' : ''}>${name}</option>`
  return `<main class="page">
    <div class="head"><div><p class="eyebrow">Identidade e informações</p><h2>Configurações</h2></div></div>
    <section class="panel">
      <form class="form" id="set">
        <div class="two">
          <label>Nome da noiva<input name="bride" value="${esc(W.bride)}" required></label>
          <label>Nome do noivo<input name="groom" value="${esc(W.groom)}" required></label>
        </div>
        <div class="two">
          <label>Data<input type="date" name="event_date" value="${W.event_date || ''}"></label>
          <label>Horário<input type="time" name="event_time" value="${W.event_time?.slice(0, 5) || ''}"></label>
        </div>
        <label>Local<input name="location" value="${esc(W.location)}"></label>
        <label>Endereço/orientações<input name="address" value="${esc(W.address)}"></label>
        <label>Dress code<textarea name="dress_code">${esc(W.dress_code)}</textarea></label>
        <div class="two">
          <label>Cor principal<input type="color" name="primary_color" value="${esc(W.primary_color)}"></label>
          <label>Cor secundária<input type="color" name="secondary_color" value="${esc(W.secondary_color)}"></label>
        </div>
        <label>Imagem de fundo (URL)<input type="url" name="background_url" value="${esc(W.background_url)}"></label>
        <label>Fonte<select name="title_font">${font('Playfair Display')}${font('Montserrat')}</select></label>
        <label>Prazo para confirmar presença<input type="date" name="rsvp_deadline" value="${W.rsvp_deadline || ''}"></label>
        <h3>Padrinhos e madrinhas</h3>
        <p class="note">Aparece somente para as famílias marcadas como padrinhos, pelo link do convite.</p>
        <label>Recado para os padrinhos<textarea name="party_message">${esc(P.message)}</textarea></label>
        <label>Traje dos padrinhos e madrinhas<textarea name="party_dress_code">${esc(P.dress_code)}</textarea></label>
        <label>Horário e local de chegada<textarea name="party_arrival">${esc(P.arrival)}</textarea></label>
        <label>Ensaio<textarea name="party_rehearsal">${esc(P.rehearsal)}</textarea></label>
        <button class="btn primary">Salvar configurações</button>
      </form>
    </section>
  </main>`
}

function bind() {
  if (view === 'guests') {
    $('#nf').onclick = () => family()
    document
      .querySelectorAll('[data-ef]')
      .forEach((b) => (b.onclick = () => family(F.find((f) => f.id === b.dataset.ef))))
    document
      .querySelectorAll('[data-inv]')
      .forEach((b) => (b.onclick = () => inviteModal(F.find((f) => f.id === b.dataset.inv))))
    document.querySelectorAll('[data-df]').forEach(
      (b) =>
        (b.onclick = async () => {
          const f = F.find((x) => x.id === b.dataset.df)
          if (!confirm(`Excluir a família ${f.name} e todas as respostas dela?`)) return
          const r = await sb.from('families').delete().eq('id', f.id)
          if (r.error) return bad(r.error)
          await log('guest', `A família ${f.name} foi excluída.`)
          owner()
        }),
    )
    document.querySelectorAll('[data-gf]').forEach(
      (b) =>
        (b.onclick = () => {
          guestFilter = b.dataset.gf
          admin()
        }),
    )
  }
  if (view === 'gifts') {
    $('#ng').onclick = () => gift()
    document.querySelectorAll('[data-eg]').forEach((b) => (b.onclick = () => gift(G.find((g) => g.id === b.dataset.eg))))
    document.querySelectorAll('[data-dg]').forEach(
      (b) =>
        (b.onclick = async () => {
          if (!confirm('Excluir este presente?')) return
          const r = await sb.from('gifts').delete().eq('id', b.dataset.dg)
          if (r.error) return bad(r.error)
          await removeGiftImage(G.find((g) => g.id === b.dataset.dg)?.image_path)
          await log('gift', 'Um presente foi excluído da lista.')
          owner()
        }),
    )
  }
  if (view === 'budget') $('#nb').onclick = () => budget()
  if (view === 'settings') {
    $('#set').onsubmit = async (e) => {
      e.preventDefault()
      const d = Object.fromEntries(new FormData(e.target))
      // Campos de data/hora vazios precisam ir como null para o Postgres.
      d.event_date ||= null
      d.event_time ||= null
      d.rsvp_deadline ||= null
      const party = { wedding_id: W.id }
      for (const key of Object.keys(d).filter((k) => k.startsWith('party_'))) {
        party[key.slice(6)] = d[key]
        delete d[key]
      }
      const r = await sb.from('weddings').update(d).eq('id', W.id).select().single()
      if (r.error) return bad(r.error)
      W = r.data
      const p = await sb.from('wedding_party_info').upsert(party)
      if (p.error) return bad(p.error)
      await log('settings', 'As configurações do casamento foram atualizadas.')
      toast('Configurações salvas.')
      owner()
    }
  }
}

function personRow(g = {}) {
  const ages = Object.entries(AGE_GROUPS)
    .map(([k, label]) => `<option value="${k}" ${g.age_group === k ? 'selected' : ''}>${label}</option>`)
    .join('')
  return `<div class="person-row" data-id="${g.id || ''}">
    <input name="person" value="${esc(g.name)}" placeholder="Nome" required>
    <select name="age">${ages}</select>
    <button type="button" class="remove" title="Remover pessoa">×</button>
  </div>`
}

function family(f = { guests: [] }) {
  const origins = ORIGINS.map((o) => `<option value="${esc(o)}">`).join('')
  pop(`<h2>${f.id ? 'Editar' : 'Nova'} família</h2>
    <form class="form" id="fam">
      <label>Nome da família<input name="name" value="${esc(f.name)}" placeholder="Família Silva" required></label>
      <div class="two">
        <label>Responsável<input name="head_name" value="${esc(f.head_name)}" required></label>
        <label>WhatsApp, com DDI<input name="phone" value="${esc(f.phone)}" placeholder="5511999999999"></label>
      </div>
      <label>Origem<input name="origin" value="${esc(f.origin)}" list="origins"><datalist id="origins">${origins}</datalist></label>
      <label class="check"><input type="checkbox" name="is_wedding_party" ${f.is_wedding_party ? 'checked' : ''}>Padrinhos e madrinhas</label>
      <div>
        <p class="eyebrow">Pessoas convidadas</p>
        <div class="people" id="people">${(f.guests.length ? f.guests : [{}]).map(personRow).join('')}</div>
        <button type="button" class="back" id="addPerson">+ Adicionar pessoa</button>
      </div>
      <button class="btn primary">Salvar família</button>
    </form>`)
  const people = $('#people')
  people.onclick = (e) => {
    if (!e.target.classList.contains('remove')) return
    if (people.children.length === 1) return toast('A família precisa de pelo menos uma pessoa.')
    e.target.closest('.person-row').remove()
  }
  $('#addPerson').onclick = () => {
    people.insertAdjacentHTML('beforeend', personRow())
    people.lastElementChild.querySelector('input').focus()
  }
  $('#fam').onsubmit = async (e) => {
    e.preventDefault()
    const form = new FormData(e.target)
    const rows = [...people.querySelectorAll('.person-row')].map((row, i) => ({
      id: row.dataset.id || null,
      name: row.querySelector('[name=person]').value.trim(),
      age_group: row.querySelector('[name=age]').value,
      position: i,
    }))
    const d = {
      name: form.get('name'),
      head_name: form.get('head_name'),
      phone: form.get('phone'),
      origin: form.get('origin'),
      is_wedding_party: form.has('is_wedding_party'),
      people_count: rows.length,
      wedding_id: W.id,
    }
    const r = await sb
      .from('families')
      .upsert(f.id ? { ...d, id: f.id } : d)
      .select()
      .single()
    if (r.error) return bad(r.error)
    const familyId = r.data.id

    // Sincroniza as pessoas: remove as excluídas, atualiza as existentes e cria as novas.
    // A resposta (rsvp_status) não é enviada, então quem já respondeu mantém a resposta.
    const kept = rows.filter((x) => x.id).map((x) => x.id)
    const removed = f.guests.filter((g) => !kept.includes(g.id)).map((g) => g.id)
    const ops = []
    if (removed.length) ops.push(sb.from('guests').delete().in('id', removed))
    const existing = rows.filter((x) => x.id).map((x) => ({ ...x, family_id: familyId }))
    if (existing.length) ops.push(sb.from('guests').upsert(existing))
    const added = rows.filter((x) => !x.id).map(({ id, ...x }) => ({ ...x, family_id: familyId }))
    if (added.length) ops.push(sb.from('guests').insert(added))
    const failed = (await Promise.all(ops)).find((x) => x.error)
    if (failed) return bad(failed.error)

    await log('guest', `A família ${d.name} foi ${f.id ? 'atualizada' : 'incluída'}.`)
    closeModal()
    owner()
  }
}

function linkRow(url = '') {
  return `<div class="link-row">
    <input type="url" name="link" value="${esc(url)}" placeholder="https://..." required>
    <span class="store-tag">${url ? esc(storeName(url)) : ''}</span>
    <button type="button" class="remove" title="Remover link">×</button>
  </div>`
}

function gift(g = {}) {
  const current = giftImageUrl(g.image_path)
  pop(`<h2>${g.id ? 'Editar' : 'Novo'} presente</h2>
    <form class="form" id="gift">
      <label>Nome<input name="name" value="${esc(g.name)}" required></label>
      <div class="two">
        <label>Valor<input name="price" type="number" step="0.01" value="${g.price || ''}" required></label>
        <label>Ícone (quando não houver imagem)<input name="icon" value="${esc(g.icon || '🎁')}"></label>
      </div>
      <label>Descrição<textarea name="description">${esc(g.description)}</textarea></label>
      <div>
        <p class="eyebrow">Imagem do presente</p>
        <div class="image-pick">
          <img id="giftPreview" alt="" ${current ? `src="${esc(current)}"` : 'hidden'}>
          <div class="image-actions">
            <label class="btn soft">${current ? 'Trocar imagem' : 'Anexar imagem'}<input type="file" id="giftFile" accept="image/*" hidden></label>
            <button type="button" class="back" id="giftNoImage" ${current ? '' : 'hidden'}>Remover imagem</button>
          </div>
        </div>
      </div>
      <div>
        <p class="eyebrow">Links das lojas</p>
        <div class="link-rows" id="links">${(g.links || []).map(linkRow).join('')}</div>
        <button type="button" class="back" id="addLink">+ Adicionar link</button>
      </div>
      <button class="btn primary" id="saveGift">Salvar presente</button>
    </form>`)

  let file = null
  let dropImage = false
  const preview = $('#giftPreview')
  $('#giftFile').onchange = (e) => {
    file = e.target.files[0] || null
    if (!file) return
    dropImage = false
    preview.src = URL.createObjectURL(file)
    preview.hidden = false
    $('#giftNoImage').hidden = false
  }
  $('#giftNoImage').onclick = () => {
    file = null
    dropImage = true
    $('#giftFile').value = ''
    preview.removeAttribute('src')
    preview.hidden = true
    $('#giftNoImage').hidden = true
  }

  const links = $('#links')
  $('#addLink').onclick = () => {
    links.insertAdjacentHTML('beforeend', linkRow())
    links.lastElementChild.querySelector('input').focus()
  }
  links.onclick = (e) => {
    if (e.target.classList.contains('remove')) e.target.closest('.link-row').remove()
  }
  links.oninput = (e) => {
    const tag = e.target.closest('.link-row')?.querySelector('.store-tag')
    if (tag) tag.textContent = safeUrl(e.target.value) ? storeName(e.target.value) : ''
  }

  $('#gift').onsubmit = async (e) => {
    e.preventDefault()
    const form = new FormData(e.target)
    const button = $('#saveGift')
    button.disabled = true
    button.textContent = 'Salvando...'
    try {
      let image_path = dropImage ? '' : g.image_path || ''
      if (file) {
        const blob = await shrinkImage(file)
        const path = `${W.id}/${crypto.randomUUID()}.jpg`
        const up = await sb.storage.from(GIFT_BUCKET).upload(path, blob, { contentType: 'image/jpeg' })
        if (up.error) throw up.error
        image_path = path
      }
      const d = {
        name: form.get('name'),
        price: +form.get('price'),
        icon: form.get('icon'),
        description: form.get('description'),
        links: form.getAll('link').map((u) => u.trim()).filter(Boolean),
        image_path,
        wedding_id: W.id,
      }
      const r = await sb.from('gifts').upsert(g.id ? { ...d, id: g.id } : d)
      if (r.error) throw r.error
      if (g.image_path && g.image_path !== image_path) await removeGiftImage(g.image_path)
      await log('gift', `${d.name} foi ${g.id ? 'atualizado' : 'adicionado'} à lista.`)
      closeModal()
      owner()
    } catch (err) {
      bad(err)
      button.disabled = false
      button.textContent = 'Salvar presente'
    }
  }
}

function budget() {
  pop(`<h2>Novo item do orçamento</h2>
    <form class="form" id="bud">
      <label>Item<input name="name" required></label>
      <div class="two">
        <label>Fornecedor<input name="supplier"></label>
        <label>Categoria<input name="category"></label>
      </div>
      <div class="two">
        <label>Valor<input name="amount" type="number" step="0.01" required></label>
        <label>Valor pago<input name="amount_paid" type="number" step="0.01" value="0" required></label>
      </div>
      <label>Vencimento<input name="due_date" type="date"></label>
      <button class="btn primary">Salvar item</button>
    </form>`)
  $('#bud').onsubmit = async (e) => {
    e.preventDefault()
    const d = Object.fromEntries(new FormData(e.target))
    d.amount = +d.amount
    d.amount_paid = +d.amount_paid
    d.due_date ||= null
    d.wedding_id = W.id
    const r = await sb.from('budget_items').insert(d)
    if (r.error) return bad(r.error)
    await log('payment', `${d.name} foi incluído no orçamento.`)
    closeModal()
    owner()
  }
}

// Desenha o QR Code em um canvas; `size` é o tamanho de cada módulo em pixels.
function qrCanvas(text, size) {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  const margin = 4
  const count = qr.getModuleCount()
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = (count + margin * 2) * size
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#000'
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) ctx.fillRect((col + margin) * size, (row + margin) * size, size, size)
    }
  }
  return canvas
}

function inviteModal(f) {
  const link = inviteLink(f)
  pop(`<p class="eyebrow">Convite${f.is_wedding_party ? ' · Padrinhos' : ''}</p>
    <h2>${esc(f.name)}</h2>
    <p>Este link é exclusivo desta família. Quem abrir verá ${f.guests.length} pessoa(s) para confirmar.</p>
    <div class="invite-link"><input id="inviteLink" value="${esc(link)}" readonly><button class="btn soft" id="copy">Copiar</button></div>
    <div class="qr" id="qr"></div>
    <div class="actions">
      <button class="btn primary" id="whats">Enviar pelo WhatsApp</button>
      <button class="btn soft" id="qrDownload">Baixar QR Code</button>
    </div>`)
  $('#qr').append(qrCanvas(link, 6))
  $('#copy').onclick = async () => {
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      $('#inviteLink').select()
      document.execCommand('copy')
    }
    toast('Link copiado.')
  }
  $('#qrDownload').onclick = () => {
    const a = document.createElement('a')
    a.href = qrCanvas(link, 24).toDataURL('image/png')
    a.download = `convite-${f.name.normalize('NFD').replace(/[^\w]+/g, '-').toLowerCase()}.png`
    a.click()
  }
  $('#whats').onclick = async () => {
    const msg = `Olá, ${f.head_name}! Com muita alegria, convidamos vocês para o casamento de ${W.bride} e ${W.groom}.\n\nConfirme a presença pelo link do seu convite:\n${link}`
    const phone = String(f.phone || '').replace(/\D/g, '')
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank')
    await log('guest', `Convite enviado para ${f.name}.`)
  }
}

function updates() {
  pop(
    `<h2>Atualizações</h2>` +
      (A.map(
        (a) =>
          `<div class="notice"><b>⌁</b><span>${esc(a.message)}<small>${new Date(a.created_at).toLocaleString('pt-BR')}</small></span></div>`,
      ).join('') || '<p class="empty">Nenhuma atualização ainda.</p>'),
  )
}

function rsvp() {
  const deadline = invite.rsvp_deadline
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
  const closed = deadline && today > deadline
  const people = invite.guests
    .map(
      (g) => `<div class="person">
        <span>${esc(g.name)}${g.age_group !== 'adult' ? `<small>${AGE_GROUPS[g.age_group]}</small>` : ''}</span>
        <div class="choice">
          <label><input type="radio" name="g-${g.id}" value="confirmed" ${g.rsvp_status === 'confirmed' ? 'checked' : ''} ${closed ? 'disabled' : ''} required>Vai</label>
          <label><input type="radio" name="g-${g.id}" value="declined" ${g.rsvp_status === 'declined' ? 'checked' : ''} ${closed ? 'disabled' : ''}>Não vai</label>
        </div>
      </div>`,
    )
    .join('')
  pop(`<p class="eyebrow">${esc(invite.family.name)}</p>
    <h2>Olá, ${esc(invite.family.head_name)}!</h2>
    <p>${
      closed
        ? 'O prazo para confirmar presença terminou. Se precisar mudar algo, fale com os noivos.'
        : `Marque quem estará com a gente${deadline ? ` até ${dt(deadline)}` : ''}.`
    }</p>
    <form class="form" id="rsvp">
      <div>${people}</div>
      <label>Restrição alimentar, acessibilidade ou recado (opcional)<textarea name="note" maxlength="1000" ${closed ? 'disabled' : ''}>${esc(invite.family.rsvp_note)}</textarea></label>
      ${closed ? '' : '<button class="btn primary">Enviar resposta</button>'}
    </form>`)
  $('#rsvp').onsubmit = async (e) => {
    e.preventDefault()
    const form = new FormData(e.target)
    const answers = invite.guests.map((g) => ({ id: g.id, status: form.get('g-' + g.id) }))
    const r = await sb.rpc('guest_rsvp', { p_token: invite.token, p_answers: answers, p_note: form.get('note') || '' })
    if (r.error) return bad(r.error)
    invite = await loadInvite(invite.token)
    closeModal()
    publicPage()
    toast('Resposta registrada. Obrigado!')
  }
}

boot().catch(bad)
