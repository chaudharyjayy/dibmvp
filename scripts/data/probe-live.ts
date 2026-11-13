// The live state of the PK layer, read the way the app reads it.
import { createClient } from '@supabase/supabase-js';
import { readRepoEnv } from './lib/env';

const env = readRepoEnv();
const db = createClient(env.SUPABASE_URL!, env.SUPABASE_ANON_KEY!, {
  auth: { persistSession: false },
});

async function main(): Promise<void> {
  const { data: pk } = await db
    .from('drug_pk')
    .select(
      'drug_id,status,ka_per_h,f_bioavailability,cl_l_per_h_per_kg,v_l_per_kg,dose_min_mg,dose_max_mg,route,source_url,source_title'
    )
    .eq('status', 'approved')
    .order('drug_id');
  console.log('approved drugs:', (pk ?? []).length);
  for (const row of pk ?? []) {
    console.log(
      `\n${row.drug_id}: ka=${row.ka_per_h} F=${row.f_bioavailability} CL=${row.cl_l_per_h_per_kg} V=${row.v_l_per_kg} dose=${row.dose_min_mg}-${row.dose_max_mg} mg`
    );
  }
  const { data: citations } = await db
    .from('drug_pk_citations')
    .select('drug_id,parameter,value,source_kind,population,source_url');
  const byDrug = new Map<string, number>();
  const kinds: Record<string, number> = {};
  for (const c of citations ?? []) {
    byDrug.set(c.drug_id, (byDrug.get(c.drug_id) ?? 0) + 1);
    kinds[c.source_kind ?? '?'] = (kinds[c.source_kind ?? '?'] ?? 0) + 1;
  }
  console.log('\ncitation rows:', (citations ?? []).length, '| kinds:', JSON.stringify(kinds));
  console.log('per drug:', JSON.stringify(Object.fromEntries(byDrug)));
  const { data: st } = await db.from('drugs').select('pk_status');
  const counts: Record<string, number> = {};
  for (const d of st ?? []) counts[d.pk_status] = (counts[d.pk_status] ?? 0) + 1;
  console.log('catalogue by pk_status:', JSON.stringify(counts));
}

void main();
