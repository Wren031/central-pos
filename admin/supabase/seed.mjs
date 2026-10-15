// Seeds the Central POS Supabase database — all SQL files, in order.
// Usage: node seed.mjs <SUPABASE_ACCESS_TOKEN> [projectRef]
// Token: https://supabase.com/dashboard/account/tokens
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const token = process.argv[2];
const ref = process.argv[3] ?? 'rkpetffnstnmwwaevzmd';

if (!token) {
  console.error('usage: node seed.mjs <SUPABASE_ACCESS_TOKEN> [projectRef]');
  process.exit(1);
}

const dir = dirname(fileURLToPath(import.meta.url));
const files = ['01_schema.sql', '02_rls.sql', '03_functions.sql', '04_seed.sql', '05_categories_migration.sql', '06_releases.sql', '07_payment_requests.sql', '08_email_verification.sql', '09_pos_type_public_read.sql', '10_client_subscription_access.sql'];

for (const f of files) {
  const sql = readFileSync(join(dir, f), 'utf8');
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  const text = await res.text();
  if (!res.ok) {
    console.error(`FAIL ${f}: HTTP ${res.status}`);
    console.error(text);
    process.exit(1);
  }
  console.log(`OK   ${f}  (${sql.length} chars, ${text.length} byte response)`);
}

console.log('\nSeed complete.');
console.log('Admin login: javierrenren1@gmail.com / monteroTzy31');
console.log('Next: change that password in Settings -> Admin profile.');
