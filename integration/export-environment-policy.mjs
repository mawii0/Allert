import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { POLICY } from '../supabase/functions/server/environment-policy.mjs';
// UTF-8 JSON.stringify(POLICY), insertion order as declared, no trailing newline.
const bytes = JSON.stringify(POLICY);
const hash = createHash('sha256').update(bytes, 'utf8').digest('hex');
mkdirSync('docs/model_v2', { recursive: true });
writeFileSync('docs/model_v2/environment-policy.json', bytes);
writeFileSync('supabase/functions/server/environment-policy-hash.mjs', `export const POLICY_HASH = "${hash}";\n`);
console.log(hash);
