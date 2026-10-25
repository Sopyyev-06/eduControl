<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, type ApiError } from '@/services/api';
import { useAuthStore } from '@/stores/auth';
import StatusBadge from '@/components/StatusBadge.vue';
import type { ReportRow } from '@/types';

const auth = useAuthStore();
const rows = ref<ReportRow[]>([]);
const total = ref(0);
const status = ref('');
const page = ref(1);
const error = ref('');
const loading = ref(false);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const qs = new URLSearchParams({ page: String(page.value), size: '30' });
    if (status.value) qs.set('status', status.value);
    const res = await api.get<{ items: ReportRow[]; total: number }>(`/api/reports?${qs}`);
    rows.value = res.items;
    total.value = res.total;
  } catch (e) {
    error.value = (e as ApiError).message;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-xl font-semibold">Hasabatlar</h1>
      <router-link v-if="auth.canCreateReport" to="/reports/new" class="btn-primary">+ Täze hasabat</router-link>
    </div>

    <div class="card flex flex-wrap gap-3 items-end">
      <div>
        <label class="label">Ýagdaý</label>
        <select v-model="status" class="input" @change="page = 1; load()">
          <option value="">Ähli</option>
          <option value="draft">Garalama</option>
          <option value="submitted_to_dean">Dekanda</option>
          <option value="submitted_to_rectorate">Rektoratda</option>
          <option value="approved">Tassyklandy</option>
          <option value="rejected">Ret edildi</option>
        </select>
      </div>
      <p class="text-sm text-slate-500 ml-auto">Jemi: {{ total }}</p>
    </div>

    <p v-if="error" class="text-sm text-rose-600">{{ error }}</p>

    <div class="card overflow-x-auto p-0">
      <table class="min-w-full">
        <thead class="bg-slate-50">
          <tr>
            <th class="th">Sene</th><th class="th">Görnüş</th><th class="th">Topar</th>
            <th class="th">Ýok</th><th class="th">Ýagdaý</th><th class="th">Awtor</th><th class="th"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="r in rows" :key="r.id" class="hover:bg-slate-50">
            <td class="td whitespace-nowrap">{{ r.report_date }}</td>
            <td class="td">{{ r.type_name }}</td>
            <td class="td font-medium">{{ r.group_name }}</td>
            <td class="td">{{ r.absent_count }}/{{ r.total_count }}</td>
            <td class="td"><StatusBadge :status="r.status" /></td>
            <td class="td text-slate-500">{{ r.created_by_name }}</td>
            <td class="td text-right"><router-link :to="`/reports/${r.id}`" class="text-brand-600 hover:underline">Aç</router-link></td>
          </tr>
          <tr v-if="!rows.length && !loading"><td class="td text-slate-400" colspan="7">Hasabat ýok</td></tr>
        </tbody>
      </table>
    </div>

    <div class="flex gap-2">
      <button class="btn-ghost" :disabled="page === 1" @click="page--; load()">← Öňki</button>
      <button class="btn-ghost" :disabled="page * 30 >= total" @click="page++; load()">Indiki →</button>
    </div>
  </div>
</template>
