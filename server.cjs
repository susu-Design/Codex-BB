const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const files = {'/':'index.html','/index.html':'index.html','/style.css':'style.css','/game.css':'game.css','/app.js':'app.js','/game.js':'game.js','/peerjs.min.js':'peerjs.min.js'};
for (const name of ['hehe', 'question', 'applause']) files[`/assets/reactions/${name}.gif`] = `assets/reactions/${name}.gif`;
files['/reactions.css'] = 'reactions.css';
files['/rage.css'] = 'rage.css';
files['/rage-themes.css'] = 'rage-themes.css';
files['/rage.js'] = 'rage.js';
files['/rage-painter.js'] = 'rage-painter.js';
for (const file of ['head-tracker.js', 'head-tracker-worker.js',
  'vendor/mediapipe/vision_bundle.cjs', 'vendor/mediapipe/vision_bundle.js', 'vendor/mediapipe/blaze_face_short_range.tflite',
  'vendor/mediapipe/wasm/vision_wasm_internal.js', 'vendor/mediapipe/wasm/vision_wasm_internal.wasm',
  'vendor/mediapipe/wasm/vision_wasm_nosimd_internal.js', 'vendor/mediapipe/wasm/vision_wasm_nosimd_internal.wasm']) files[`/${file}`] = file;
files['/card-preview.html'] = 'card-preview.html';
http.createServer((req,res)=>{
  const file=files[new URL(req.url,'http://localhost').pathname];
  if(!file){res.writeHead(404);res.end('Not found');return;}
  const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.cjs':'text/javascript; charset=utf-8','.gif':'image/gif','.wasm':'application/wasm','.tflite':'application/octet-stream'};
  res.writeHead(200,{'Content-Type':types[path.extname(file)],'Cache-Control':'no-store'});
  fs.createReadStream(path.join(__dirname,file)).pipe(res);
}).listen(Number(process.env.PORT) || 4173,'127.0.0.1',()=>console.log(`Demo ready at http://localhost:${process.env.PORT || 4173}`));
