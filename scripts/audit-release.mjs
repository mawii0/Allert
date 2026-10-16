import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,dirname,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
// Read local tracked source only. Never read secret files or contact a backend.
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const entry=join(root,'supabase/functions/server/index.tsx'),seen=new Set();
async function inspect(path){
 if(seen.has(path))return;seen.add(path);
 const source=await readFile(path,'utf8');
 for(const match of source.matchAll(/(?:from\s*|import\s*\()\s*["'](\.\.?\/[^"']+)["']/g)){
  const target=resolve(dirname(path),match[1]);
  if(!target.startsWith(join(root,'supabase/functions/')))throw Error('Backend import leaves the functions directory.');
  await inspect(target);
 }
 console.log(createHash('sha256').update(source).digest('hex').slice(0,16)+'  '+relative(root,path).replaceAll('\\','/'));
}
await inspect(entry);
const files=await readdir(join(root,'supabase/functions/server'));
for(const file of files.filter(name=>/\.(mjs|tsx?|jsx?)$/.test(name))){
 const full=join(root,'supabase/functions/server',file);
 if(!seen.has(full))console.log('REVIEW: source file is not imported by this entrypoint: '+file);
}
console.log('PASS: all relative backend imports exist. Compare this inventory with the Supabase editor before deployment.');
