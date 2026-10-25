<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, type ApiError } from '@/services/api';
import StatusBadge from '@/components/StatusBadge.vue';
import type { ChangeRequest } from '@/types';

const rows = ref<ChangeRequest[]>([]);
const detail = ref<any>(null);
const statusFilter = ref('');
const error = ref('');

async function load() {
  const qs = statusFilter.value ? `?status=${statusFilter.value}` : '';
  rows.value = await api.get<ChangeRequest[]>(`/api/change-requests${qs}`);
}

async function open(id: number) {
  detail.value = await api.get<any>(`/api/change-requests/${id}`);
}

async function decide(decision: 'approve' | 'reject') {
  error.value = '';
  let comment = '';
  if (decision === 'reject') {
    comment = window.prompt('Ret sebäbi (hökmany):') ?? '';
    if (!comment.trim()) return;
  }
  try {
    await api.post(`/api/change-requests/${detail.value.request.id}/decide`, { decision, comment });
    detail.value = null;
    await load();
  } catch (e) {
    error.value = (e as ApiError).message;
  }
}

onMounted(() => load().catch((e) => (error.value = (e as ApiError).message)));
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-xl font-semibold">Üýtgetme haýyşlary</h1>
    <div class="card flex gap-3 items-end">
      <div>
        <label class="label">Ýagdaý</label>
        <select v-model="statusFilter" class="input" @change="load()">
          <option value="">Ähli</option>
          <option value="pending">Garaşýar</option>
          <option value="approved">Kabul edildi</option>
          <option value="rejected">Ret edildi</option>
        </select>
      </div>
    </div>

    <p v-if="error" class="text-sm text-rose-600">{{ error }}</p>

    <div class="card p-0 overflow-x-auto">
      <table class="min-w-full">
        <thead class="bg-slate-50">
          <tr><th class="th">#</th><th class="th">Hasabat</th><th class="th">Topar</th><th class="th">Üýtgeşme</th><th class="th">Ýagdaý</th><th class="th">Kim</th><th class="th"></th></tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="r in rows" :key="r.id">
            <td class="td">{{ r.id }}</td>
            <td class="td">#{{ r.report_id }} <span class="text-slate-400">{{ r.report_date }}</span></td>
            <td class="td font-medium">{{ r.group_name }}</td>
            <td class="td">{{ r.changes_count }}</td>
            <td class="td"><StatusBadge :status="r.status" /></td>
            <td class="td text-slate-500">{{ r.requested_by_name }}</td>
            <td class="td text-right"><button class="text-brand-600 hover:underline" @click="open(r.id)">Aç</button></td>
          </tr>
          <tr v-if="!rows.length"><td class="td text-slate-400" colspan="7">Haýyş ýok</td></tr>
        </tbody>
      </table>
    </div>

    <div v-if="detail" class="card space-y-3">
      <div class="flex justify-between items-start">
        <h2 class="text-sm font-semibold">
          Haýyş #{{ detail.request.id }} — hasabat #{{ detail.request.report_id }} ({{ detail.request.group_name }})
        </h2>
        <button class="text-slate-400" @click="detail = null">✕</button>
      </div>
      <table class="min-w-full text-sm">
        <thead><tr><th class="th">Talyp</th><th class="th">Meýdan</th><th class="th">Köne</th><th class="th">Täze</th></tr></thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="i in detail.items" :key="i.id">
            <td class="td">{{ i.last_name }} {{ i.first_name }}</td>
            <td class="td">{{ i.field }}</td>
            <td class="td text-slate-400">{{ i.old_value ?? '—' }}</td>
            <td class="td font-medium">{{ i.new_value ?? '—' }}</td>
          </tr>
        </tbody>
      </table>
      <p class="text-xs text-slate-500">
        Bitewi karar: ähli üýtgeşme birden kabul ýa-da ret edilýär. Ret edilse hasabat üýtgeýär.
      </p>
      <div v-if="detail.request.status === 'pending'" class="flex gap-2">
        <button class="btn-primary" @click="decide('approve')">Ählisini kabul et</button>
        <button class="btn-danger" @click="decide('reject')">Ret et</button>
      </div>
      <p v-else class="text-sm text-slate-500">Karar: {{ detail.request.status }} — {{ detail.request.decision_comment ?? '' }}</p>
    </div>
  </div>
</template>
