import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const root = resolve(process.argv[2] ?? 'dist');
const port = Number(process.env.KITCHEN_PORT || 4173);
const mount = (process.env.KITCHEN_BASE || '').replace(/\/$/, '');
const types = {'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json',
  '.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.webmanifest':'application/manifest+json','.woff2':'font/woff2'};
createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url,'http://localhost').pathname);
    if (mount && !pathname.startsWith(mount+'/')) throw Error();
    const file = resolve(root, '.' + pathname.slice(mount.length) + (pathname.endsWith('/') ? 'index.html' : ''));
    if (!file.startsWith(root+sep) || !(await stat(file)).isFile()) throw Error();
    response.writeHead(200,{'Content-Type':(types[extname(file)] || 'application/octet-stream')+'; charset=utf-8','Cache-Control':'no-cache'});
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404).end('Not found');
  }
}).listen(port,'127.0.0.1',()=>console.log('http://127.0.0.1:'+port+mount+'/'));
