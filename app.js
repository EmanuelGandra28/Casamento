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

// W: casamento, G: presentes, F: famílias, B: orçamento, A: atualizações, U: usuário logado.
let W
let G = []
let F = []
let B = []
let A = []
let U
let view = 'home'
let guest

const VIEWS = {
  home: 'Visão geral',
  guests: 'Convidados',
  gifts: 'Lista de presentes',
  budget: 'Orçamento',
  settings: 'Configurações',
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
  if (U && W?.owner_id === U.id) return owner()
  if (W) return publicPage()
  setup()
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
  const [f, g, b, a] = await Promise.all([
    sb.from('families').select('*').eq('wedding_id', W.id).order('created_at', { ascending: false }),
    sb.from('gifts').select('*').eq('wedding_id', W.id).order('created_at', { ascending: false }),
    sb.from('budget_items').select('*').eq('wedding_id', W.id).order('due_date'),
    sb.from('activity_log').select('*').eq('wedding_id', W.id).order('created_at', { ascending: false }).limit(30),
  ])
  F = f.data || []
  G = g.data || []
  B = b.data || []
  A = a.data || []
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
  app(`<div class="public" ${bg}>
    <nav class="public-nav"><b>${esc(W.bride)} & ${esc(W.groom)}</b><button id="admin">Área dos noivos</button></nav>
    <section class="public-hero">
      <p class="eyebrow">Nosso casamento</p>
      <h1>${esc(W.bride)}<br>& ${esc(W.groom)}</h1>
      <p>${when}</p>
      <button id="guest" class="btn primary">Confirmar presença</button>
    </section>
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
  $('#guest').onclick = guestStart
}

function giftCard(g, manage = false) {
  const l1 = safeUrl(g.store_link_1)
  const l2 = safeUrl(g.store_link_2)
  const links =
    l1 || l2
      ? `<div class="links">${l1 ? `<a target="_blank" rel="noopener" href="${esc(l1)}">Loja 1 ↗</a>` : ''}${
          l2 ? `<a target="_blank" rel="noopener" href="${esc(l2)}">Loja 2 ↗</a>` : ''
        }</div>`
      : ''
  const actions = manage
    ? `<div class="actions"><button class="act" data-eg="${g.id}">Editar</button><button class="act" data-dg="${g.id}">Excluir</button></div>`
    : ''
  return `<article class="gift">
    <div class="emoji">${esc(g.icon || '🎁')}</div>
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
  const people = (status) => F.filter((f) => !status || f.rsvp_status === status).reduce((n, f) => n + f.people_count, 0)
  const total = people()
  const yes = people('confirmed')
  const no = people('declined')
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

function guestPanel() {
  const status = { confirmed: 'Confirmado', declined: 'Não irá', pending: 'Pendente' }
  const rows =
    F.map(
      (f) => `<tr>
        <td><b>${esc(f.name)}</b><small>${f.people_count} pessoa(s)</small></td>
        <td>${esc(f.head_name)}</td>
        <td><b>${esc(f.pin_code)}</b></td>
        <td>${esc(f.origin || '—')}</td>
        <td><span class="status ${f.rsvp_status}">${status[f.rsvp_status] || 'Pendente'}</span></td>
        <td><div class="actions"><button class="act" data-ef="${f.id}">Editar</button><button class="act" data-inv="${f.id}">Convite</button></div></td>
      </tr>`,
    ).join('') || '<tr><td colspan="6" class="empty">Nenhuma família cadastrada.</td></tr>'
  return `<main class="page">
    <div class="head">
      <div>
        <p class="eyebrow">Famílias e RSVP</p>
        <h2>Convidados</h2>
        <p>PIN único por família e confirmação pelo responsável.</p>
      </div>
      <button class="btn primary" id="nf">+ Nova família</button>
    </div>
    <table class="table">
      <thead><tr><th>Família</th><th>Responsável</th><th>PIN</th><th>Origem</th><th>RSVP</th><th></th></tr></thead>
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
        <p>Inclua até dois links de lojas.</p>
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
      .forEach((b) => (b.onclick = () => invite(F.find((f) => f.id === b.dataset.inv))))
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
      const r = await sb.from('weddings').update(d).eq('id', W.id).select().single()
      if (r.error) return bad(r.error)
      W = r.data
      await log('settings', 'As configurações do casamento foram atualizadas.')
      toast('Configurações salvas.')
      owner()
    }
  }
}

function family(f = {}) {
  const pin = f.pin_code || String(Math.floor(1000 + Math.random() * 9000))
  pop(`<h2>${f.id ? 'Editar' : 'Nova'} família</h2>
    <form class="form" id="fam">
      <label>Nome da família<input name="name" value="${esc(f.name)}" required></label>
      <div class="two">
        <label>Responsável<input name="head_name" value="${esc(f.head_name)}" required></label>
        <label>PIN de 4 dígitos<input name="pin_code" value="${esc(pin)}" pattern="[0-9]{4}" maxlength="4" required></label>
      </div>
      <div class="two">
        <label>Pessoas<input name="people_count" type="number" min="1" value="${f.people_count || 1}" required></label>
        <label>Origem<input name="origin" value="${esc(f.origin)}"></label>
      </div>
      <label>WhatsApp, com DDI<input name="phone" value="${esc(f.phone)}" placeholder="5511999999999"></label>
      <button class="btn primary">Salvar família</button>
    </form>`)
  $('#fam').onsubmit = async (e) => {
    e.preventDefault()
    const d = Object.fromEntries(new FormData(e.target))
    d.people_count = +d.people_count
    d.wedding_id = W.id
    const r = await sb.from('families').upsert(f.id ? { ...d, id: f.id } : d)
    if (r.error) return bad(r.error.code === '23505' ? new Error('Este PIN já está em uso. Escolha outro.') : r.error)
    await log('guest', `${d.head_name} foi ${f.id ? 'atualizado(a)' : 'incluído(a)'} como responsável.`)
    closeModal()
    owner()
  }
}

function gift(g = {}) {
  pop(`<h2>${g.id ? 'Editar' : 'Novo'} presente</h2>
    <form class="form" id="gift">
      <label>Nome<input name="name" value="${esc(g.name)}" required></label>
      <div class="two">
        <label>Valor<input name="price" type="number" step="0.01" value="${g.price || ''}" required></label>
        <label>Ícone<input name="icon" value="${esc(g.icon || '🎁')}"></label>
      </div>
      <label>Descrição<textarea name="description">${esc(g.description)}</textarea></label>
      <label>Link da loja 1<input type="url" name="store_link_1" value="${esc(g.store_link_1)}"></label>
      <label>Link da loja 2<input type="url" name="store_link_2" value="${esc(g.store_link_2)}"></label>
      <button class="btn primary">Salvar presente</button>
    </form>`)
  $('#gift').onsubmit = async (e) => {
    e.preventDefault()
    const d = Object.fromEntries(new FormData(e.target))
    d.price = +d.price
    d.wedding_id = W.id
    const r = await sb.from('gifts').upsert(g.id ? { ...d, id: g.id } : d)
    if (r.error) return bad(r.error)
    await log('gift', `${d.name} foi ${g.id ? 'atualizado' : 'adicionado'} à lista.`)
    closeModal()
    owner()
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

function invite(f) {
  const msg = encodeURIComponent(
    `Olá, ${f.head_name}! Você está convidado(a) para o casamento de ${W.bride} e ${W.groom}.\n\nAcesse ${cfg.siteUrl || location.href} e use o PIN da família: *${f.pin_code}*.`,
  )
  const phone = String(f.phone || '').replace(/\D/g, '')
  window.open(`https://wa.me/${phone}?text=${msg}`, '_blank')
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

async function callGuestAccess(body) {
  const r = await sb.functions.invoke('guest-access', { body })
  if (r.error) {
    // Em respostas de erro (4xx/5xx), a mensagem da função vem no corpo da resposta.
    const detail = await r.error.context?.json?.().catch(() => null)
    throw new Error(detail?.error || 'Não foi possível concluir agora.')
  }
  if (r.data?.error) throw new Error(r.data.error)
  return r.data
}

function guestStart() {
  pop(`<p class="eyebrow">Confirmação em duas etapas</p>
    <h2>Seu convite</h2>
    <form class="form" id="start">
      <label>PIN de 4 dígitos<input name="pin" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required></label>
      <label>Nome do responsável<input name="head" required></label>
      <button class="btn primary">Enviar código</button>
    </form>`)
  $('#start').onsubmit = async (e) => {
    e.preventDefault()
    const d = Object.fromEntries(new FormData(e.target))
    try {
      const data = await callGuestAccess({ action: 'start', ...d })
      verify(data.familyId)
    } catch (err) {
      bad(err)
    }
  }
}

function verify(familyId) {
  $('#modalBody').innerHTML = `<p class="eyebrow">Segunda etapa</p>
    <h2>Código enviado</h2>
    <p>Enviamos um código para o WhatsApp cadastrado.</p>
    <form class="form" id="verify">
      <label>Código<input name="code" inputmode="numeric" maxlength="6" required></label>
      <button class="btn primary">Acessar convite</button>
    </form>`
  $('#verify').onsubmit = async (e) => {
    e.preventDefault()
    const code = new FormData(e.target).get('code')
    try {
      const data = await callGuestAccess({ action: 'verify', familyId, code })
      // O código é enviado de novo ao gravar a resposta, que só é aceita com ele.
      guest = { ...data.family, code }
      rsvp()
    } catch (err) {
      bad(err)
    }
  }
}

function rsvp() {
  pop(`<h2>Olá, ${esc(guest.head_name)}!</h2>
    <p>Deseja confirmar a presença da sua família?</p>
    <div class="actions">
      <button class="btn primary" id="yes">Sim, estaremos lá</button>
      <button class="btn soft" id="no">Não conseguiremos ir</button>
    </div>`)
  $('#yes').onclick = () => send('confirmed')
  $('#no').onclick = () => send('declined')
}

async function send(response) {
  try {
    await callGuestAccess({ action: 'rsvp', familyId: guest.id, code: guest.code, response })
    closeModal()
    toast('Resposta registrada. Obrigado!')
  } catch (err) {
    bad(err)
  }
}

boot().catch(bad)
