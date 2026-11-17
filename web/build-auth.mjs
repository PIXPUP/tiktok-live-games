import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
await mkdir('dist/pages',{recursive:true});
await build({entryPoints:['web/auth/worker.mjs'],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:'dist/pages/_worker.js',minify:true,legalComments:'none'});
await build({entryPoints:['web/auth/client.js'],bundle:true,format:'esm',platform:'browser',target:'es2020',outfile:'dist/pages/auth.js',minify:true,legalComments:'eof'});
await writeFile('dist/pages/_routes.json',JSON.stringify({version:1,include:['/*'],exclude:[]}));
console.log('Firebase auth client and protected Pages worker built');
