// Supabase Edge Function: valida PIN + responsável, envia/valida o segundo fator e grava RSVP.
// Configure os segredos SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e, para produção,
// WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID e WHATSAPP_TEMPLATE_NAME.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const CODE_TTL_MS = 10 * 60_000
const RESEND_WAIT_MS = 60_000
const MAX_ATTEMPTS = 5

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const hash = async (value: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('')

// Compara nomes sem diferenciar maiúsculas, acentos e espaços extras.
const normalize = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

const randomCode = () => String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000))

const isUuid = (value: unknown) =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const body = await request.json().catch(() => ({}))

  // Confere o código mais recente da família. Erros contam tentativas; o código só é consumido no RSVP.
  const checkCode = async (familyId: unknown, code: unknown) => {
    if (!isUuid(familyId)) return { error: 'Convite não encontrado.', status: 404 }
    const { data: challenge } = await admin
      .from('rsvp_challenges')
      .select('id,code_hash,expires_at,attempts,families!inner(id,wedding_id,head_name)')
      .eq('family_id', familyId)
      .is('used_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!challenge || new Date(challenge.expires_at) < new Date() || challenge.attempts >= MAX_ATTEMPTS) {
      return { error: 'Código expirado. Solicite outro.', status: 400 }
    }
    if (challenge.code_hash !== (await hash(String(code ?? '')))) {
      await admin.from('rsvp_challenges').update({ attempts: challenge.attempts + 1 }).eq('id', challenge.id)
      return { error: 'Código inválido.', status: 401 }
    }
    return { challenge }
  }

  if (body.action === 'start') {
    const pin = String(body.pin ?? '')
    const head = normalize(body.head)
    if (!/^[0-9]{4}$/.test(pin) || !head) return reply({ error: 'Convite não encontrado.' }, 404)

    const { data: families } = await admin.from('families').select('id,head_name,phone').eq('pin_code', pin)
    const family = (families ?? []).find((f) => normalize(f.head_name) === head)
    if (!family) return reply({ error: 'Convite não encontrado.' }, 404)

    const { data: recent } = await admin
      .from('rsvp_challenges')
      .select('created_at')
      .eq('family_id', family.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (recent && Date.now() - new Date(recent.created_at).getTime() < RESEND_WAIT_MS) {
      return reply({ error: 'Aguarde um minuto antes de pedir outro código.' }, 429)
    }

    const token = Deno.env.get('WHATSAPP_TOKEN')
    const phoneId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')
    const template = Deno.env.get('WHATSAPP_TEMPLATE_NAME')
    if (!token || !phoneId || !template || !family.phone) {
      return reply({ error: 'O envio por WhatsApp ainda não foi configurado pelos noivos.' }, 503)
    }

    const code = randomCode()
    await admin.from('rsvp_challenges').delete().eq('family_id', family.id).is('used_at', null)
    await admin.from('rsvp_challenges').insert({
      family_id: family.id,
      code_hash: await hash(code),
      expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
    })

    const sent = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: family.phone.replace(/\D/g, ''),
        type: 'template',
        template: {
          name: template,
          language: { code: 'pt_BR' },
          components: [{ type: 'body', parameters: [{ type: 'text', text: code }] }],
        },
      }),
    })
    if (!sent.ok) return reply({ error: 'Não foi possível enviar o código agora.' }, 502)
    return reply({ ok: true, familyId: family.id })
  }

  if (body.action === 'verify') {
    const result = await checkCode(body.familyId, body.code)
    if (result.error) return reply({ error: result.error }, result.status)
    const family = result.challenge.families
    return reply({ ok: true, family: { id: family.id, head_name: family.head_name } })
  }

  if (body.action === 'rsvp') {
    const response = body.response === 'confirmed' ? 'confirmed' : body.response === 'declined' ? 'declined' : null
    if (!response) return reply({ error: 'Resposta inválida.' }, 400)
    const result = await checkCode(body.familyId, body.code)
    if (result.error) return reply({ error: result.error }, result.status)

    const { data: family } = await admin
      .from('families')
      .update({ rsvp_status: response })
      .eq('id', body.familyId)
      .select('wedding_id,head_name')
      .single()
    if (!family) return reply({ error: 'Convite não encontrado.' }, 404)
    await admin.from('rsvp_challenges').update({ used_at: new Date().toISOString() }).eq('id', result.challenge.id)
    await admin.from('activity_log').insert({
      wedding_id: family.wedding_id,
      kind: 'rsvp',
      message: `${family.head_name} ${response === 'confirmed' ? 'confirmou presença.' : 'informou que não poderá ir.'}`,
    })
    return reply({ ok: true })
  }

  return reply({ error: 'Ação inválida.' }, 400)
})
