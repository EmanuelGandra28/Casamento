// Supabase Edge Function: valida PIN + responsável, envia/valida o segundo fator e grava RSVP.
// Configure os segredos SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e, para produção,
// WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID e WHATSAPP_TEMPLATE_NAME.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map(x => x.toString(16).padStart(2, '0')).join('')

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const body = await request.json().catch(() => ({}))
  if (body.action === 'start') {
    const { data: family } = await admin.from('families').select('id,head_name,phone').eq('pin_code', String(body.pin || '')).ilike('head_name', String(body.head || '')).maybeSingle()
    if (!family) return reply({ error: 'Convite não encontrado.' }, 404)
    const code = String(Math.floor(100000 + Math.random() * 900000))
    await admin.from('rsvp_challenges').delete().eq('family_id', family.id).is('used_at', null)
    await admin.from('rsvp_challenges').insert({ family_id: family.id, code_hash: await hash(code), expires_at: new Date(Date.now() + 10 * 60_000).toISOString() })
    const token = Deno.env.get('WHATSAPP_TOKEN'), phoneId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID'), template = Deno.env.get('WHATSAPP_TEMPLATE_NAME')
    if (!token || !phoneId || !template || !family.phone) return reply({ error: 'O envio por WhatsApp ainda não foi configurado pelos noivos.' }, 503)
    const sent = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: family.phone.replace(/\D/g, ''), type: 'template', template: { name: template, language: { code: 'pt_BR' }, components: [{ type: 'body', parameters: [{ type: 'text', text: code }] }] } }) })
    if (!sent.ok) return reply({ error: 'Não foi possível enviar o código agora.' }, 502)
    return reply({ ok: true, familyId: family.id })
  }
  if (body.action === 'verify') {
    const { data: challenge } = await admin.from('rsvp_challenges').select('id,family_id,code_hash,expires_at,attempts,families!inner(id,wedding_id,head_name)').eq('family_id', body.familyId).is('used_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (!challenge || new Date(challenge.expires_at) < new Date() || challenge.attempts >= 5) return reply({ error: 'Código expirado. Solicite outro.' }, 400)
    if (challenge.code_hash !== await hash(String(body.code || ''))) { await admin.from('rsvp_challenges').update({ attempts: challenge.attempts + 1 }).eq('id', challenge.id); return reply({ error: 'Código inválido.' }, 401) }
    await admin.from('rsvp_challenges').update({ used_at: new Date().toISOString() }).eq('id', challenge.id)
    return reply({ ok: true, family: challenge.families })
  }
  if (body.action === 'rsvp') {
    const response = body.response === 'confirmed' ? 'confirmed' : body.response === 'declined' ? 'declined' : null
    if (!response || !body.familyId) return reply({ error: 'Resposta inválida.' }, 400)
    const { data: family } = await admin.from('families').update({ rsvp_status: response }).eq('id', body.familyId).select('wedding_id,head_name').single()
    if (!family) return reply({ error: 'Convite não encontrado.' }, 404)
    await admin.from('activity_log').insert({ wedding_id: family.wedding_id, kind: 'rsvp', message: `${family.head_name} ${response === 'confirmed' ? 'confirmou presença.' : 'informou que não poderá ir.'}` })
    return reply({ ok: true })
  }
  return reply({ error: 'Ação inválida.' }, 400)
})
