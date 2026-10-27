// Servidor estático simples para testar o site localmente (npm start).
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'

const root = resolve(process.cwd())
const port = process.env.PORT || 4173
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
}

createServer(async (request, response) => {
  try {
    // Ignora query string (ex.: config.js?v=10) e impede acesso fora da pasta do projeto.
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname))
    if (!file.startsWith(root + sep)) throw new Error('Fora da pasta do projeto')
    const body = await readFile(file)
    response.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' })
    response.end(body)
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Não encontrado')
  }
}).listen(port, '0.0.0.0', () => console.log(`http://localhost:${port}`))
