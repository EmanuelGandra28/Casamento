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
// P: informações dos padrinhos, R: reservas de presentes, U: usuário logado, invite: convite aberto pelo link.
let R = []
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

// ---------- Pix (BR Code estático do Banco Central) ----------

const PIX_KEY_TYPES = { cpf: 'CPF', cnpj: 'CNPJ', phone: 'Celular', email: 'E-mail', random: 'Chave aleatória' }

const ascii = (v, max) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
    .slice(0, max)

function pixKey() {
  const key = String(W.pix_key || '').trim()
  if (W.pix_key_type === 'cpf' || W.pix_key_type === 'cnpj') return key.replace(/\D/g, '')
  if (W.pix_key_type === 'phone') return '+55' + key.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')
  if (W.pix_key_type === 'email') return key.toLowerCase()
  return key
}

const pixReady = () => !!(W.pix_key && W.pix_name && W.pix_city)

// CRC16-CCITT (polinômio 0x1021, início 0xFFFF), exigido no campo 63 do BR Code.
function crc16(text) {
  let crc = 0xffff
  for (let i = 0; i < text.length; i++) {
    crc ^= text.charCodeAt(i) << 8
    for (let bit = 0; bit < 8; bit++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

// Código "copia e cola". Sem valor, o convidado digita o valor no app do banco.
function pixPayload(amount) {
  const field = (id, value) => id + String(value.length).padStart(2, '0') + value
  const account = field('00', 'br.gov.bcb.pix') + field('01', pixKey())
  const body =
    field('00', '01') +
    field('26', account) +
    field('52', '0000') +
    field('53', '986') +
    (amount > 0 ? field('54', Number(amount).toFixed(2)) : '') +
    field('58', 'BR') +
    field('59', ascii(W.pix_name, 25)) +
    field('60', ascii(W.pix_city, 15)) +
    field('62', field('05', '***')) +
    '6304'
  return body + crc16(body)
}

// Mostra QR Code e copia-e-cola do Pix dentro de `target`.
function renderPix(target, amount, note = '') {
  const code = pixPayload(amount)
  target.innerHTML = `<div class="pix">
    <div class="qr" id="pixQr"></div>
    <p class="pix-amount">${amount > 0 ? cash(amount) : 'Valor livre'}</p>
    <p class="note">Abra o app do seu banco, escolha Pix e leia o QR Code ou use o copia e cola.${note ? ' ' + note : ''}</p>
    <div class="invite-link"><input id="pixCode" value="${esc(code)}" readonly><button type="button" class="btn soft" id="pixCopy">Copiar</button></div>
    <p class="note">Recebedor: <b>${esc(W.pix_name)}</b> · ${esc(PIX_KEY_TYPES[W.pix_key_type] || 'Chave')}</p>
  </div>`
  target.querySelector('#pixQr').append(qrCanvas(code, 5))
  target.querySelector('#pixCopy').onclick = async () => {
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      target.querySelector('#pixCode').select()
      document.execCommand('copy')
    }
    toast('Código Pix copiado.')
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

function pop(x, size = '') {
  closeModal()
  $('#app').insertAdjacentHTML(
    'beforeend',
    `<div class="modal-bg" id="modal"><div class="modal ${size}"><button class="close" id="close">×</button><div id="modalBody">${x}</div></div></div>`,
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
  const [f, g, b, a, p, rs] = await Promise.all([
    sb.from('families').select('*, guests(*)').eq('wedding_id', W.id).order('created_at', { ascending: false }),
    sb.from('gifts').select('*').eq('wedding_id', W.id).order('created_at', { ascending: false }),
    sb.from('budget_items').select('*').eq('wedding_id', W.id).order('due_date'),
    sb.from('activity_log').select('*').eq('wedding_id', W.id).order('created_at', { ascending: false }).limit(30),
    sb.from('wedding_party_info').select('*').eq('wedding_id', W.id).maybeSingle(),
    sb.from('gift_reservations').select('*, families(name)').order('created_at'),
  ])
  const failed = [f, g, b, a, p, rs].find((r) => r.error)
  if (failed) bad(failed.error)
  F = (f.data || []).map((x) => ({ ...x, guests: (x.guests || []).sort((m, n) => m.position - n.position) }))
  G = g.data || []
  B = b.data || []
  A = a.data || []
  P = p.data || {}
  R = rs.data || []
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

// ---------- Página do convidado: agenda, como chegar, dress code e FAQ ----------

const destination = () => [W.location, W.address].filter(Boolean).join(', ')
const multiline = (v) => esc(v).replace(/\n/g, '<br>')

// Evento na agenda: com horário, dura 2 horas; sem horário, ocupa o dia inteiro.
// O Brasil não tem horário de verão desde 2019, então o fuso é sempre UTC-3.
function calendarEvent() {
  if (!W.event_date) return null
  const title = `Casamento de ${W.bride} & ${W.groom}`
  const details = `${title}. Mais informações: ${siteUrl()}`
  if (!W.event_time) {
    const day = W.event_date.replace(/-/g, '')
    const next = new Date(localDate(W.event_date).getTime() + 86400000).toLocaleDateString('sv-SE').replace(/-/g, '')
    return { title, details, allDay: true, start: day, end: next }
  }
  const start = new Date(`${W.event_date}T${W.event_time.slice(0, 5)}:00-03:00`)
  const end = new Date(start.getTime() + 2 * 3600000)
  const utc = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  return { title, details, allDay: false, start: utc(start), end: utc(end) }
}

function googleCalendarUrl(ev) {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.title,
    dates: `${ev.start}/${ev.end}`,
    details: ev.details,
    location: destination(),
    ctz: 'America/Sao_Paulo',
  })
  return `https://calendar.google.com/calendar/render?${params}`
}

// Arquivo .ics: abre direto na agenda do iPhone, Outlook e outros apps.
function downloadIcs(ev) {
  const text = (v) => String(v).replace(/[\\,;]/g, (c) => '\\' + c).replace(/\n/g, '\\n')
  const when = ev.allDay
    ? [`DTSTART;VALUE=DATE:${ev.start}`, `DTEND;VALUE=DATE:${ev.end}`]
    : [`DTSTART:${ev.start}`, `DTEND:${ev.end}`]
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Casamento//PT-BR',
    'BEGIN:VEVENT',
    `UID:${W.id}@casamento`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
    ...when,
    `SUMMARY:${text(ev.title)}`,
    `DESCRIPTION:${text(ev.details)}`,
    `LOCATION:${text(destination())}`,
    'BEGIN:VALARM',
    'TRIGGER:-P1D',
    'ACTION:DISPLAY',
    `DESCRIPTION:${text(ev.title)} é amanhã!`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
  a.download = 'casamento.ics'
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

function countdownText() {
  if (!W.event_date) return ''
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const days = Math.round((localDate(W.event_date) - today) / 86400000)
  if (days > 1) return `Faltam ${days} dias`
  if (days === 1) return 'É amanhã!'
  if (days === 0) return 'É hoje!'
  return ''
}

function arrivalSection() {
  const dest = destination()
  if (!dest) return ''
  const q = encodeURIComponent(dest)
  return `<section class="public-section">
    <p class="eyebrow">Como chegar</p>
    <h2>${esc(W.location || 'Local da cerimônia')}</h2>
    ${W.address ? `<p class="note">${esc(W.address)}</p>` : ''}
    <div class="route">
      <iframe class="map" title="Mapa do local" loading="lazy" referrerpolicy="no-referrer-when-downgrade"
        src="https://maps.google.com/maps?q=${q}&output=embed"></iframe>
      <div>
        <div class="links">
          <a class="store" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${q}">Google Maps ↗</a>
          <a class="store" target="_blank" rel="noopener" href="https://waze.com/ul?q=${q}&navigate=yes">Waze ↗</a>
          <a class="store" target="_blank" rel="noopener" href="https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[formatted_address]=${q}">Uber ↗</a>
        </div>
        ${W.arrival_notes ? `<p class="arrival">${multiline(W.arrival_notes)}</p>` : ''}
      </div>
    </div>
  </section>`
}

const isHex = (c) => /^#[0-9a-f]{6}$/i.test(c)

function dressSection() {
  const palette = (W.dress_palette || []).filter(isHex)
  const avoid = (W.dress_avoid || []).filter(isHex)
  if (!W.dress_code && !palette.length && !avoid.length && !W.dress_tips) return ''
  const swatches = (colors, cls) =>
    `<div class="swatches">${colors.map((c) => `<span class="swatch ${cls}" style="background:${esc(c)}" title="${esc(c)}"></span>`).join('')}</div>`
  return `<section class="public-section">
    <p class="eyebrow">Dress code</p>
    <h2>O que vestir</h2>
    ${W.dress_code ? `<p class="lead">${multiline(W.dress_code)}</p>` : ''}
    <div class="info">
      ${palette.length ? `<article><h3>Cores sugeridas</h3>${swatches(palette, '')}</article>` : ''}
      ${avoid.length ? `<article><h3>Cores a evitar</h3>${swatches(avoid, 'avoid')}</article>` : ''}
      ${W.dress_tips ? `<article><h3>Dicas</h3><p>${multiline(W.dress_tips)}</p></article>` : ''}
    </div>
  </section>`
}

function faqSection() {
  // Perguntas ainda sem resposta (como as sugeridas) ficam fora da página.
  const faq = (W.faq || []).filter((f) => f.q && f.a)
  if (!faq.length) return ''
  return `<section class="public-section">
    <p class="eyebrow">Dúvidas</p>
    <h2>Perguntas frequentes</h2>
    <div class="faq">${faq
      .map((f) => `<details><summary>${esc(f.q)}</summary><p>${multiline(f.a)}</p></details>`)
      .join('')}</div>
  </section>`
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
  const ev = calendarEvent()
  const countdown = countdownText()
  app(`<div class="public" ${bg}>
    <nav class="public-nav"><b>${esc(W.bride)} & ${esc(W.groom)}</b><button id="admin">Área dos noivos</button></nav>
    <section class="public-hero">
      <p class="eyebrow">${invite ? `Convite para ${esc(invite.family.name)}` : 'Nosso casamento'}</p>
      <h1>${esc(W.bride)}<br>& ${esc(W.groom)}</h1>
      <p>${when}</p>
      ${countdown ? `<p class="countdown">${countdown}</p>` : ''}
      ${cta}
    </section>
    ${invite?.family.is_wedding_party ? partySection(invite.party || {}) : ''}
    <section class="public-section">
      <p class="eyebrow">O grande dia</p>
      <h2>Informações para você</h2>
      <div class="info">
        <article>
          <h3>Quando</h3>
          <p>${dt(W.event_date)}<br>${W.event_time ? W.event_time.slice(0, 5) : ''}</p>
          ${
            ev
              ? `<div class="links">
                  <a class="store" target="_blank" rel="noopener" href="${esc(googleCalendarUrl(ev))}">Google Agenda ↗</a>
                  <button class="store" id="ics">iPhone / Outlook</button>
                </div>`
              : ''
          }
        </article>
        <article><h3>Onde</h3><p>${esc(W.location || 'Local a definir')}<br>${esc(W.address)}</p></article>
        ${
          W.rsvp_deadline
            ? `<article><h3>Confirmação</h3><p>Confirme sua presença até ${dt(W.rsvp_deadline)}, pelo link do seu convite.</p></article>`
            : ''
        }
      </div>
    </section>
    ${arrivalSection()}
    ${dressSection()}
    ${faqSection()}
    <section class="public-section">
      <p class="eyebrow">Lista de presentes</p>
      <h2>Com carinho</h2>
      <div class="grid">${
        G.map((g) => giftCard(g)).join('') + freeGiftCard() || '<p class="empty">A lista será publicada em breve.</p>'
      }</div>
    </section>
    <footer class="footer">Feito com carinho para celebrar um novo capítulo.</footer>
  </div>`)
  $('#admin').onclick = () => (U && W.owner_id === U.id ? owner() : login())
  if (invite) $('#guest').onclick = rsvp
  if (ev) $('#ics').onclick = () => downloadIcs(ev)
  bindGiftActions()
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

const giftLimit = (g) => (g.kind === 'quota' ? g.quota_total : 1)
const giftLeft = (g) => Math.max(giftLimit(g) - (g.taken || 0), 0)

function storeLinks(g) {
  const urls = (g.links || []).map(safeUrl).filter(Boolean)
  return urls.length
    ? `<div class="links">${urls
        .map((u) => `<a class="store" target="_blank" rel="noopener" href="${esc(u)}">${esc(storeName(u))} ↗</a>`)
        .join('')}</div>`
    : ''
}

function quotaBar(g) {
  return `<div class="bar"><i class="confirmed" style="width:${(100 * (g.taken || 0)) / g.quota_total}%"></i></div>
    <small class="quota-count">${g.taken || 0} de ${g.quota_total} cotas presenteadas</small>`
}

const mineGift = (g) => (invite?.reservations || []).some((r) => r.gift_id === g.id)

// O que o convidado vê e pode fazer em cada presente.
function guestGiftActions(g) {
  const mine = (invite?.reservations || []).filter((r) => r.gift_id === g.id)
  const mineQty = mine.reduce((n, r) => n + r.quantity, 0)
  const parts = []
  if (mine.length) {
    parts.push(
      `<p class="mine">${g.kind === 'quota' ? `Vocês reservaram ${mineQty} cota(s).` : 'Vocês escolheram este presente.'}</p>`,
    )
    const buttons = mine
      .map(
        (r) =>
          `${g.kind === 'quota' ? `<button class="act" data-pix="${r.id}">Ver Pix</button>` : ''}<button class="act" data-cancel="${r.id}">Desistir</button>`,
      )
      .join('')
    parts.push(`<div class="actions">${buttons}</div>`)
  }
  if (giftLeft(g) > 0) {
    if (g.kind === 'quota' ? pixReady() : true) {
      const label = g.kind === 'quota' ? (mine.length ? 'Presentear mais cotas' : 'Presentear com Pix') : 'Vou dar este presente'
      parts.push(`<button class="btn primary pick" data-pick="${g.id}">${label}</button>`)
    }
  } else if (!mine.length) {
    parts.push(`<p class="taken-label">${g.kind === 'quota' ? 'Todas as cotas já foram presenteadas' : 'Já escolhido'}</p>`)
  }
  return parts.join('')
}

// Para os noivos: quem escolheu e o botão para liberar a reserva.
function ownerGiftStatus(g) {
  const list = R.filter((r) => r.gift_id === g.id)
  if (!list.length) return '<p class="taken-label">Ninguém escolheu ainda.</p>'
  return `<div class="reservations">${list
    .map(
      (r) => `<div class="row"><span>${esc(r.families?.name || 'Convidado')}${
        g.kind === 'quota' ? ` · ${r.quantity} cota(s) · ${cash(r.quantity * g.price)}` : ''
      }${r.message ? `<small>“${esc(r.message)}”</small>` : ''}</span><button class="act" data-release="${r.id}">Liberar</button></div>`,
    )
    .join('')}</div>`
}

function giftCard(g, manage = false) {
  const picture = g.image_path
    ? `<img class="gift-img" src="${esc(giftImageUrl(g.image_path))}" alt="${esc(g.name)}" loading="lazy">`
    : `<div class="emoji">${esc(g.icon || '🎁')}</div>`
  const price = g.kind === 'quota' ? `${cash(g.price)} <small>por cota</small>` : cash(g.price)
  const soldOut = giftLeft(g) === 0
  return `<article class="gift ${soldOut ? 'is-taken' : ''}">
    ${picture}
    ${g.kind === 'quota' ? '<span class="badge">Cotas por Pix</span>' : ''}
    <h3>${esc(g.name)}</h3>
    <p>${esc(g.description)}</p>
    <b>${price}</b>
    ${g.kind === 'quota' ? quotaBar(g) : ''}
    ${g.kind === 'item' && (!soldOut || manage || mineGift(g)) ? storeLinks(g) : ''}
    ${
      manage
        ? `${ownerGiftStatus(g)}<div class="actions"><button class="act" data-eg="${g.id}">Editar</button><button class="act" data-dg="${g.id}">Excluir</button></div>`
        : guestGiftActions(g)
    }
  </article>`
}

function freeGiftCard() {
  if (!pixReady()) return ''
  return `<article class="gift free">
    <div class="emoji">💛</div>
    <h3>Contribuição livre</h3>
    <p>Prefere presentear com um valor à sua escolha? Envie por Pix com todo o carinho.</p>
    <button class="btn primary pick" id="freePix">Presentear com Pix</button>
  </article>`
}

async function refreshPublic() {
  if (invite) invite = await loadInvite(invite.token)
  await publicPage()
}

function bindGiftActions() {
  document
    .querySelectorAll('[data-pick]')
    .forEach((b) => (b.onclick = () => pickGift(G.find((g) => g.id === b.dataset.pick))))
  document.querySelectorAll('[data-pix]').forEach(
    (b) =>
      (b.onclick = () => {
        const r = invite.reservations.find((x) => x.id === b.dataset.pix)
        const g = G.find((x) => x.id === r.gift_id)
        pop(`<p class="eyebrow">${esc(g.name)}</p><h2>Pagamento por Pix</h2><div id="pixArea"></div>`)
        renderPix($('#pixArea'), r.quantity * g.price, `${r.quantity} cota(s).`)
      }),
  )
  document.querySelectorAll('[data-cancel]').forEach(
    (b) =>
      (b.onclick = async () => {
        if (!confirm('Desistir deste presente? Ele volta a ficar disponível para outros convidados.')) return
        const r = await sb.rpc('cancel_gift_reservation', { p_token: invite.token, p_reservation: b.dataset.cancel })
        if (r.error) return bad(r.error)
        await refreshPublic()
        toast('Escolha desfeita.')
      }),
  )
  const free = $('#freePix')
  if (!free) return
  free.onclick = () => {
    pop(`<p class="eyebrow">Contribuição livre</p>
      <h2>Presentear com Pix</h2>
      <form class="form" id="freeForm">
        <label>Valor (opcional)<input name="amount" type="number" min="1" step="0.01" placeholder="Em branco: você digita o valor no banco"></label>
        <button class="btn primary">Gerar Pix</button>
      </form>
      <div id="pixArea"></div>`)
    $('#freeForm').onsubmit = (e) => {
      e.preventDefault()
      renderPix($('#pixArea'), +new FormData(e.target).get('amount') || 0)
    }
  }
}

function pickGift(g) {
  if (!invite) {
    return pop(`<h2>${esc(g.name)}</h2>
      <p>Para escolher um presente, abra o site pelo link do seu convite. Assim os noivos sabem quem presenteou e ninguém escolhe o mesmo item.</p>
      ${g.kind === 'item' ? storeLinks(g) : ''}`)
  }
  const left = giftLeft(g)
  const quota = g.kind === 'quota'
  pop(`<p class="eyebrow">${quota ? 'Cotas por Pix' : 'Presente'}</p>
    <h2>${esc(g.name)}</h2>
    <p>${
      quota
        ? `Cada cota vale ${cash(g.price)}. Restam ${left} de ${g.quota_total}.`
        : 'Ao confirmar, o presente fica reservado para vocês e aparece como escolhido para os outros convidados. Depois é só comprar pela loja.'
    }</p>
    <form class="form" id="pickForm">
      ${
        quota
          ? `<label>Quantas cotas?<input name="qty" type="number" min="1" max="${left}" value="1" required></label>
             <p class="pix-amount" id="pickTotal">${cash(g.price)}</p>`
          : ''
      }
      <label>Recado para os noivos (opcional)<textarea name="message" maxlength="500"></textarea></label>
      <button class="btn primary" id="pickSubmit">${quota ? 'Reservar e pagar com Pix' : 'Confirmar que vou dar este presente'}</button>
    </form>`)
  const form = $('#pickForm')
  if (quota) form.qty.oninput = () => ($('#pickTotal').textContent = cash((+form.qty.value || 0) * g.price))
  form.onsubmit = async (e) => {
    e.preventDefault()
    $('#pickSubmit').disabled = true
    const qty = quota ? Math.min(Math.max(Math.floor(+form.qty.value) || 1, 1), left) : 1
    const r = await sb.rpc('reserve_gift', {
      p_token: invite.token,
      p_gift: g.id,
      p_quantity: qty,
      p_message: form.message.value,
    })
    if (r.error) {
      $('#pickSubmit').disabled = false
      return bad(r.error)
    }
    await refreshPublic()
    if (quota) {
      pop(`<p class="eyebrow">${esc(g.name)}</p><h2>Obrigado! Agora é só pagar</h2><div id="pixArea"></div>
        <p class="note">Se não conseguir pagar agora, o Pix continua disponível no botão “Ver Pix” do presente.</p>`)
      renderPix($('#pixArea'), qty * g.price, `${qty} cota(s).`)
    } else {
      pop(`<p class="eyebrow">Presente reservado</p><h2>Obrigado pelo carinho!</h2>
        <p><b>${esc(g.name)}</b> está reservado para vocês. Compre pela loja de sua preferência:</p>${storeLinks(g)}`)
    }
  }
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
    ${originPanel()}
  </main>`
}

// Pessoas por origem: total, confirmados, pendentes e quem não vai, na ordem da planilha.
function originPanel() {
  const stats = new Map()
  for (const f of F) {
    const origin = f.origin?.trim() || 'Sem origem'
    if (!stats.has(origin)) stats.set(origin, { total: 0, confirmed: 0, pending: 0, declined: 0 })
    const s = stats.get(origin)
    for (const g of f.guests) {
      s.total++
      s[g.rsvp_status]++
    }
  }
  if (!stats.size) return ''
  const rank = (o) => (ORIGINS.includes(o) ? ORIGINS.indexOf(o) : o === 'Sem origem' ? 999 : 500)
  const rows = [...stats.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([origin, s]) => {
      const pct = (n) => (s.total ? (n / s.total) * 100 : 0)
      return `<tr>
        <td><b>${esc(origin)}</b>
          <div class="bar" title="${s.confirmed} confirmados, ${s.pending} pendentes, ${s.declined} não vão">
            <i class="confirmed" style="width:${pct(s.confirmed)}%"></i><i class="pending" style="width:${pct(s.pending)}%"></i><i class="declined" style="width:${pct(s.declined)}%"></i>
          </div>
        </td>
        <td>${s.total}</td>
        <td>${s.confirmed}</td>
        <td>${s.pending}</td>
        <td>${s.declined}</td>
        <td><b>${Math.round(pct(s.confirmed))}%</b></td>
      </tr>`
    })
    .join('')
  return `<section class="panel origin-panel">
    <h3>RSVP por origem</h3>
    <table class="table">
      <thead><tr><th>Origem</th><th>Pessoas</th><th>Confirmados</th><th>Pendentes</th><th>Não vão</th><th>Confirmação</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`
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
      <div class="head-actions">
        <button class="btn soft" id="importGuests">Importar planilha</button>
        <button class="btn primary" id="nf">+ Nova família</button>
      </div>
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
        <p>Presentes únicos com links das lojas, ou cotas pagas por Pix. Vocês veem aqui quem escolheu cada um.</p>
      </div>
      <button class="btn primary" id="ng">+ Novo presente</button>
    </div>
    ${pixReady() ? '' : '<p class="notice-warn">Cadastre a chave Pix em Configurações para liberar as cotas e a contribuição livre.</p>'}
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

const FAQ_SUGGESTIONS = [
  'Posso levar crianças?',
  'Tem estacionamento no local?',
  'Que horas devo chegar?',
  'Até quando posso confirmar presença?',
  'Como funciona a lista de presentes?',
]

function faqRow(item = {}) {
  return `<div class="faq-row">
    <div class="faq-fields">
      <input name="faq_q" value="${esc(item.q)}" placeholder="Pergunta">
      <textarea name="faq_a" placeholder="Resposta">${esc(item.a)}</textarea>
    </div>
    <button type="button" class="remove" title="Remover pergunta">×</button>
  </div>`
}

function colorChip(name, color = '#c8d2bd') {
  return `<span class="color-chip"><input type="color" name="${name}" value="${esc(color)}"><button type="button" class="remove" title="Remover cor">×</button></span>`
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
        <label>Local<input name="location" value="${esc(W.location)}" placeholder="Ex.: Rancho Mineiro"></label>
        <label>Endereço (usado no mapa e nas rotas)<input name="address" value="${esc(W.address)}" placeholder="Rua, número, bairro, cidade"></label>
        <label>Como chegar: estacionamento, entrada, desembarque<textarea name="arrival_notes">${esc(W.arrival_notes)}</textarea></label>
        <h3>Dress code</h3>
        <label>Traje e explicação<textarea name="dress_code" placeholder="Ex.: Esporte fino. Cerimônia ao ar livre, à tarde.">${esc(W.dress_code)}</textarea></label>
        <div class="two">
          <div><p class="eyebrow">Cores sugeridas</p><div class="color-list" id="paletteList" data-name="dress_palette">${(W.dress_palette || []).filter(isHex).map((c) => colorChip('dress_palette', c)).join('')}<button type="button" class="add-color" data-add="paletteList">+</button></div></div>
          <div><p class="eyebrow">Cores a evitar</p><div class="color-list" id="avoidList" data-name="dress_avoid">${(W.dress_avoid || []).filter(isHex).map((c) => colorChip('dress_avoid', c)).join('')}<button type="button" class="add-color" data-add="avoidList">+</button></div></div>
        </div>
        <label>Dicas práticas<textarea name="dress_tips" placeholder="Ex.: Cerimônia no gramado: prefira salto grosso ou sapatilha.">${esc(W.dress_tips)}</textarea></label>
        <h3>Perguntas frequentes</h3>
        <div class="faq-rows" id="faqRows">${(W.faq || []).map(faqRow).join('')}</div>
        <div class="head-actions">
          <button type="button" class="back" id="addFaq">+ Adicionar pergunta</button>
          <button type="button" class="back" id="suggestFaq">Sugerir perguntas comuns</button>
        </div>
        <h3>Pix para presentes</h3>
        <p class="note">Usado nas cotas e na contribuição livre. Os convidados veem o nome do recebedor e a chave no código Pix.</p>
        <div class="two">
          <label>Tipo de chave<select name="pix_key_type">${Object.entries(PIX_KEY_TYPES)
            .map(([k, label]) => `<option value="${k}" ${W.pix_key_type === k ? 'selected' : ''}>${label}</option>`)
            .join('')}</select></label>
          <label>Chave Pix<input name="pix_key" value="${esc(W.pix_key)}" placeholder="CPF, celular, e-mail ou chave aleatória"></label>
        </div>
        <div class="two">
          <label>Nome do recebedor (como no banco)<input name="pix_name" value="${esc(W.pix_name)}" maxlength="25"></label>
          <label>Cidade do recebedor<input name="pix_city" value="${esc(W.pix_city)}" maxlength="15" placeholder="Ex.: Belo Horizonte"></label>
        </div>
        <h3>Aparência</h3>
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
    $('#importGuests').onclick = importGuests
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
    document.querySelectorAll('[data-release]').forEach(
      (b) =>
        (b.onclick = async () => {
          const res = R.find((r) => r.id === b.dataset.release)
          if (!confirm(`Liberar a escolha de ${res.families?.name || 'convidado'}? O presente volta a ficar disponível.`)) return
          const r = await sb.from('gift_reservations').delete().eq('id', res.id)
          if (r.error) return bad(r.error)
          await log('gift', `A escolha de ${res.families?.name || 'um convidado'} foi liberada.`)
          owner()
        }),
    )
  }
  if (view === 'budget') $('#nb').onclick = () => budget()
  if (view === 'settings') {
    const form = $('#set')
    form.onclick = (e) => {
      const remove = e.target.closest('.remove')
      if (remove) remove.closest('.faq-row, .color-chip')?.remove()
      const add = e.target.closest('[data-add]')
      if (add) {
        const list = $('#' + add.dataset.add)
        add.insertAdjacentHTML('beforebegin', colorChip(list.dataset.name))
      }
    }
    $('#addFaq').onclick = () => {
      $('#faqRows').insertAdjacentHTML('beforeend', faqRow())
      $('#faqRows').lastElementChild.querySelector('input').focus()
    }
    $('#suggestFaq').onclick = () => {
      const current = [...form.querySelectorAll('[name=faq_q]')].map((i) => plain(i.value))
      const missing = FAQ_SUGGESTIONS.filter((q) => !current.includes(plain(q)))
      if (!missing.length) return toast('As perguntas sugeridas já estão na lista.')
      $('#faqRows').insertAdjacentHTML('beforeend', missing.map((q) => faqRow({ q })).join(''))
      toast('Perguntas adicionadas. Preencha as respostas e salve.')
    }
    form.onsubmit = async (e) => {
      e.preventDefault()
      const fd = new FormData(e.target)
      const answers = fd.getAll('faq_a')
      const lists = {
        faq: fd
          .getAll('faq_q')
          .map((q, i) => ({ q: q.trim(), a: String(answers[i] || '').trim() }))
          .filter((f) => f.q),
        dress_palette: fd.getAll('dress_palette'),
        dress_avoid: fd.getAll('dress_avoid'),
      }
      for (const key of ['faq_q', 'faq_a', 'dress_palette', 'dress_avoid']) fd.delete(key)
      const d = { ...Object.fromEntries(fd), ...lists }
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

// ---------- Importação da planilha de convidados ----------

const XLSX_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'

// Colunas reconhecidas, em ordem de prioridade para adivinhar pelo cabeçalho.
// "Nome do responsável" deve virar responsável, por isso `head` vem antes de `person`.
const IMPORT_FIELDS = [
  ['head', 'Responsável', ['responsavel']],
  ['family', 'Família / núcleo', ['familia', 'nucleo', 'grupo']],
  ['phone', 'WhatsApp', ['whatsapp', 'telefone', 'celular', 'fone', 'contato']],
  ['origin', 'Origem', ['origem', 'categoria', 'lado']],
  ['age', 'Faixa etária', ['faixa', 'idade', 'crianca']],
  ['party', 'Padrinhos', ['padrinho', 'madrinha']],
  ['person', 'Nome da pessoa', ['nome', 'convidado', 'pessoa']],
]

// Texto simplificado para comparar: sem acento, minúsculo, sem pontuação.
const plain = (v) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

// Chave da origem: ignora "(a)", "da/do", e trata amiga/amigo, convidada/convidado igual.
const originKey = (v) =>
  plain(String(v ?? '').replace(/\((a|o|s)\)/gi, ''))
    .replace(/\bamiga\b/g, 'amigo')
    .replace(/\bconvidada\b/g, 'convidado')
    .split(' ')
    .filter((w) => w && !['da', 'do', 'de', 'dos', 'das'].includes(w))
    .join(' ')

function matchOrigin(value) {
  if (!String(value ?? '').trim()) return { origin: '', known: true }
  const found = ORIGINS.find((o) => originKey(o) === originKey(value))
  return { origin: found || String(value).trim(), known: !!found }
}

function ageGroup(value) {
  const v = plain(value)
  if (v.includes('beb')) return 'baby'
  if (v.includes('crian') || v.includes('infant')) return 'child'
  return 'adult'
}

// Só dígitos; números brasileiros com DDD (10 ou 11 dígitos) ganham o DDI 55.
function whatsappNumber(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits.length === 10 || digits.length === 11 ? '55' + digits : digits
}

const isYes = (value) => /^(sim|s|x|1|true|verdadeiro|padrinho|madrinha|padrinhos)$/.test(plain(value))

function loadXlsx() {
  if (window.XLSX) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = XLSX_SRC
    s.onload = resolve
    s.onerror = () => reject(new Error('Não foi possível carregar o leitor de planilhas. Verifique a internet.'))
    document.head.append(s)
  })
}

async function downloadTemplate() {
  await loadXlsx()
  const book = XLSX.utils.book_new()
  const guests = XLSX.utils.aoa_to_sheet([
    ['Família', 'Nome', 'Responsável', 'WhatsApp', 'Origem', 'Faixa etária', 'Padrinhos'],
    ['Família Silva', 'Ana Silva', 'Ana Silva', '5511999999999', 'Família Noiva', 'Adulto', 'Sim'],
    ['Família Silva', 'Pedro Silva', '', '', '', 'Adulto', ''],
    ['Família Silva', 'Lia Silva', '', '', '', 'Criança', ''],
    ['Carlos Souza', 'Carlos Souza', '', '5511988888888', 'Amigo(a) do Noivo', 'Adulto', ''],
  ])
  guests['!cols'] = [{ wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 30 }, { wch: 12 }, { wch: 10 }]
  XLSX.utils.book_append_sheet(book, guests, 'Convidados')
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Origens aceitas'], ...ORIGINS.map((o) => [o])]), 'Origens')
  XLSX.writeFile(book, 'modelo-convidados.xlsx')
}

// Lê a primeira aba: a primeira linha preenchida é o cabeçalho.
async function readSheet(file) {
  await loadXlsx()
  const bytes = await file.arrayBuffer()
  let book
  if (/\.csv$/i.test(file.name)) {
    // CSV do Excel em português costuma vir em Windows-1252; os demais, em UTF-8.
    let text = new TextDecoder('utf-8').decode(bytes)
    if (text.includes('�')) text = new TextDecoder('windows-1252').decode(bytes)
    book = XLSX.read(text.replace(/^﻿/, ''), { type: 'string' })
  } else {
    book = XLSX.read(bytes, { type: 'array' })
  }
  const rows = XLSX.utils
    .sheet_to_json(book.Sheets[book.SheetNames[0]], { header: 1, defval: '', raw: false })
    .filter((r) => r.some((c) => String(c).trim()))
  if (rows.length < 2) throw new Error('A planilha precisa de um cabeçalho e pelo menos uma linha de convidado.')
  const [header, ...data] = rows
  return { header: header.map((h) => String(h).trim()), data }
}

function guessColumns(header) {
  const used = new Set()
  const map = {}
  for (const [key, , words] of IMPORT_FIELDS) {
    const index = header.findIndex((h, i) => !used.has(i) && words.some((w) => plain(h).includes(w)))
    map[key] = index
    if (index >= 0) used.add(index)
  }
  return map
}

// Agrupa as linhas em famílias. Sem coluna de família, cada pessoa vira uma família.
function buildFamilies(data, map) {
  const cell = (row, key) => (map[key] >= 0 ? String(row[map[key]] ?? '').trim() : '')
  const groups = new Map()
  let skipped = 0
  for (const row of data) {
    const name = cell(row, 'person')
    if (!name) {
      skipped++
      continue
    }
    const familyName = cell(row, 'family') || name
    const key = plain(familyName)
    if (!groups.has(key)) {
      groups.set(key, { name: familyName, head: '', phone: '', origin: '', originKnown: true, party: false, guests: [] })
    }
    const f = groups.get(key)
    f.guests.push({ name, age_group: ageGroup(cell(row, 'age')) })
    f.head ||= cell(row, 'head')
    f.phone ||= whatsappNumber(cell(row, 'phone'))
    if (!f.origin && cell(row, 'origin')) {
      const o = matchOrigin(cell(row, 'origin'))
      f.origin = o.origin
      f.originKnown = o.known
    }
    f.party ||= isYes(cell(row, 'party'))
  }
  const existing = new Set(F.map((f) => plain(f.name)))
  const families = [...groups.values()].map((f) => ({
    ...f,
    head: f.head || f.guests[0].name,
    exists: existing.has(plain(f.name)),
  }))
  return { families, skipped }
}

function importGuests() {
  pop(
    `<p class="eyebrow">Convidados</p>
    <h2>Importar planilha</h2>
    <p>Envie um arquivo .xlsx ou .csv com uma linha por pessoa. Pessoas com o mesmo nome na coluna Família ficam no mesmo convite.</p>
    <div class="actions">
      <label class="btn primary file-btn">Escolher arquivo<input type="file" id="sheetFile" accept=".xlsx,.xls,.csv" hidden></label>
      <button class="btn soft" id="template">Baixar modelo</button>
    </div>
    <div id="importArea"></div>`,
    'wide',
  )
  $('#template').onclick = () => downloadTemplate().catch(bad)
  $('#sheetFile').onchange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    try {
      const sheet = await readSheet(file)
      importPreview(sheet, guessColumns(sheet.header), file.name)
    } catch (err) {
      bad(err)
    }
  }
}

function importPreview(sheet, map, fileName) {
  const { families, skipped } = buildFamilies(sheet.data, map)
  const toImport = families.filter((f) => !f.exists)
  const people = toImport.reduce((n, f) => n + f.guests.length, 0)
  const unknownOrigins = [...new Set(toImport.filter((f) => !f.originKnown).map((f) => f.origin))]
  const options = (key) =>
    `<option value="-1">— não usar —</option>` +
    sheet.header.map((h, i) => `<option value="${i}" ${map[key] === i ? 'selected' : ''}>${esc(h || `Coluna ${i + 1}`)}</option>`).join('')
  const selects = IMPORT_FIELDS.map(
    ([key, label]) => `<label>${label}${key === 'person' ? ' *' : ''}<select data-col="${key}">${options(key)}</select></label>`,
  ).join('')
  const warnings = [
    map.person < 0 && 'Escolha a coluna com o nome de cada pessoa.',
    skipped && `${skipped} linha(s) sem nome serão ignoradas.`,
    families.length - toImport.length &&
      `${families.length - toImport.length} família(s) já cadastrada(s) com o mesmo nome serão ignoradas.`,
    unknownOrigins.length &&
      `Origens fora da lista padrão (serão importadas como estão): ${unknownOrigins.map(esc).join(', ')}.`,
  ].filter(Boolean)
  const rows = toImport
    .slice(0, 50)
    .map(
      (f) => `<tr>
        <td><b>${esc(f.name)}</b>${f.party ? '<span class="badge">Padrinhos</span>' : ''}<small>${f.guests
          .map((g) => esc(g.name) + (g.age_group !== 'adult' ? ` (${AGE_GROUPS[g.age_group].toLowerCase()})` : ''))
          .join(', ')}</small></td>
        <td>${esc(f.head)}</td>
        <td>${esc(f.phone || '—')}</td>
        <td>${esc(f.origin || '—')}${f.originKnown ? '' : ' <span class="warn">?</span>'}</td>
      </tr>`,
    )
    .join('')
  $('#importArea').innerHTML = `
    <p class="note">Arquivo: <b>${esc(fileName)}</b>. Confira de qual coluna vem cada informação:</p>
    <div class="form map-grid">${selects}</div>
    ${warnings.map((w) => `<p class="notice-warn">${w}</p>`).join('')}
    <table class="table preview">
      <thead><tr><th>Família e pessoas</th><th>Responsável</th><th>WhatsApp</th><th>Origem</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4" class="empty">Nenhuma família nova para importar.</td></tr>'}</tbody>
    </table>
    ${toImport.length > 50 ? `<p class="note">Mostrando 50 de ${toImport.length} famílias.</p>` : ''}
    <button class="btn primary" id="doImport" ${toImport.length && map.person >= 0 ? '' : 'disabled'}>
      Importar ${toImport.length} família(s) e ${people} pessoa(s)
    </button>`
  document.querySelectorAll('[data-col]').forEach(
    (s) =>
      (s.onchange = () => {
        map[s.dataset.col] = +s.value
        importPreview(sheet, map, fileName)
      }),
  )
  $('#doImport').onclick = () => saveImport(toImport)
}

async function saveImport(families) {
  const button = $('#doImport')
  button.disabled = true
  button.textContent = 'Importando...'
  // IDs criados aqui ligam cada pessoa à sua família sem depender da ordem de retorno do banco.
  const rows = families.map((f) => ({
    id: crypto.randomUUID(),
    wedding_id: W.id,
    name: f.name,
    head_name: f.head,
    phone: f.phone,
    origin: f.origin,
    is_wedding_party: f.party,
    people_count: f.guests.length,
  }))
  const guests = families.flatMap((f, i) =>
    f.guests.map((g, position) => ({ ...g, position, family_id: rows[i].id })),
  )
  const r = await sb.from('families').insert(rows)
  if (r.error) {
    button.disabled = false
    button.textContent = 'Tentar novamente'
    return bad(r.error)
  }
  const g = await sb.from('guests').insert(guests)
  if (g.error) {
    // Sem as pessoas, as famílias ficariam vazias: desfaz a importação.
    await sb.from('families').delete().in('id', rows.map((x) => x.id))
    button.disabled = false
    button.textContent = 'Tentar novamente'
    return bad(g.error)
  }
  await log('guest', `${rows.length} família(s) e ${guests.length} pessoa(s) importadas da planilha.`)
  closeModal()
  toast(`${rows.length} família(s) importadas.`)
  owner()
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
      <label>Tipo
        <select name="kind" id="giftKind">
          <option value="item" ${g.kind !== 'quota' ? 'selected' : ''}>Presente único (o convidado compra na loja)</option>
          <option value="quota" ${g.kind === 'quota' ? 'selected' : ''}>Cotas por Pix (ex.: lua de mel)</option>
        </select>
      </label>
      <div class="two">
        <label><span id="priceLabel">${g.kind === 'quota' ? 'Valor de cada cota' : 'Valor'}</span><input name="price" type="number" step="0.01" min="0" value="${g.price || ''}" required></label>
        <label id="quotaField" ${g.kind === 'quota' ? '' : 'hidden'}>Quantidade de cotas<input name="quota_total" type="number" min="${Math.max(g.taken || 0, 1)}" value="${g.quota_total || 10}"></label>
      </div>
      <label>Ícone (quando não houver imagem)<input name="icon" value="${esc(g.icon || '🎁')}"></label>
      <p class="notice-warn" id="pixWarn" ${g.kind === 'quota' && !pixReady() ? '' : 'hidden'}>Cadastre a chave Pix em Configurações para os convidados conseguirem presentear as cotas.</p>
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

  $('#giftKind').onchange = (e) => {
    const quota = e.target.value === 'quota'
    $('#quotaField').hidden = !quota
    $('#priceLabel').textContent = quota ? 'Valor de cada cota' : 'Valor'
    $('#pixWarn').hidden = !quota || pixReady()
  }

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
        kind: form.get('kind'),
        quota_total: form.get('kind') === 'quota' ? Math.max(Math.floor(+form.get('quota_total')) || 1, 1) : 1,
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
