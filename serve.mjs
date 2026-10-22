import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('./dist/',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.txt':'text/plain; charset=utf-8','.webp':'image/webp','.png':'image/png'};
http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');const name=decodeURIComponent(url.pathname);const target=path.resolve(root,'.'+(name.endsWith('/')?name+'index.html':name));if(!target.startsWith(root)){res.writeHead(403).end();return}const s=await stat(target);if(!s.isFile())throw new Error('not a file');res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream'});res.end(await readFile(target));}catch{res.writeHead(404).end('Not found')}}).listen(8765,'127.0.0.1',()=>console.log('millsage: http://127.0.0.1:8765'));
