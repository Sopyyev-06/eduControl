<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, type ApiError } from '@/services/api';

const rows = ref<any[]>([]);
const total = ref(0);
const action = ref('');
const page = ref(1);
const error = ref('');

async function load() {
  error.value = '';
  const qs = new URLSearchParams({ page: String(page.value), size: '50' });
  if (action.value) qs.set('action', action.value);
  const res = await api.get<{ items: any[]; total: number }>(`/api/audit?${qs}`);
  rows.value = res.items;
  total.value = res.total;
}

onMounted(() => load().catch((e) => (error.value = (e as ApiError).message)));
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-xl font-semibold">Audit žurnaly</h1>
    <div class="card flex flex-wrap gap-3 items-end">
      <div>
        <label class="label">Hereket</label>
        <select v-model="action" class="input" @change="page = 1; load()">
          <option value="">Ähli</option>
          <option value="AUTH">Giriş/çykyş</option>
          <option value="PII">Şahsy maglumat</option>
          <option value="REPORT">Hasabat</option>
          <option value="CHANGE_REQUEST">Üýtgetme haýyşy</option>
          <option value="USER">Ulanyjy</option>
        </select>
      </div>
      <p class="text-sm text-slate-500 ml-auto">Jemi: {{ total }}</p>
    </div>
    <p v-if="error" class="text-sm text-rose-600">{{ error }}</p>
    <div class="card p-0 overflow-x-auto">
      <table class="min-w-full">
        <thead class="bg-slate-50">
          <tr><th class="th">Wagt</th><th class="th">Kim</th><th class="th">Hereket</th><th class="th">Obýekt</th><th class="th">IP</th></tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="r in rows" :key="r.id">
            <td class="td whitespace-nowrap text-slate-500">{{ new Date(r.created_at).toLocaleString() }}</td>
            <td class="td">{{ r.actor_name ?? '—' }} <span class="text-xs text-slate-400">{{ r.actor_role ?? '' }}</span></td>
            <td class="td font-mono text-xs">{{ r.action }}</td>
            <td class="td text-slate-500">{{ r.entity }} {{ r.entity_id ?? '' }}</td>
            <td class="td text-slate-400 text-xs">{{ r.ip ?? '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="flex gap-2">
      <button class="btn-ghost" :disabled="page === 1" @click="page--; load()">← Öňki</button>
      <button class="btn-ghost" :disabled="page * 50 >= total" @click="page++; load()">Indiki →</button>
    </div>
  </div>
</template>
