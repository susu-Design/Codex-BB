const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const files = {'/':'index.html','/index.html':'index.html','/style.css':'style.css','/app.js':'app.js'};
http.createServer((req,res)=>{
  const file=files[new URL(req.url,'http://localhost').pathname];
  if(!file){res.writeHead(404);res.end('Not found');return;}
  const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
  res.writeHead(200,{'Content-Type':types[path.extname(file)],'Cache-Control':'no-store'});
  fs.createReadStream(path.join(__dirname,file)).pipe(res);
}).listen(4173,'127.0.0.1',()=>console.log('Demo ready at http://localhost:4173'));
