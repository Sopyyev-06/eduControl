<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, type ApiError } from '@/services/api';

interface Dash {
  counts: { students: number; groups: number; reports: number; pending_dean: number; pending_rectorate: number; pending_changes: number };
  byStatus: { status: string; n: number }[];
  trend: { report_date: string; reports: number; absences: number | null }[];
  topReasons: { name: string; n: number }[];
}

const data = ref<Dash | null>(null);
const error = ref('');

onMounted(async () => {
  try {
    data.value = await api.get<Dash>('/api/dashboard');
  } catch (e) {
    error.value = (e as ApiError).message;
  }
});

const maxAbsence = () => Math.max(1, ...(data.value?.trend ?? []).map((t) => Number(t.absences || 0)));
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-xl font-semibold">Baş sahypa</h1>
    <p v-if="error" class="text-sm text-rose-600">{{ error }}</p>

    <div v-if="data" class="grid grid-cols-2 lg:grid-cols-6 gap-3">
      <div class="card"><p class="text-xs text-slate-500">Talyp-lar</p><p class="text-2xl font-semibold">{{ data.counts.students }}</p></div>
      <div class="card"><p class="text-xs text-slate-500">Toparlar</p><p class="text-2xl font-semibold">{{ data.counts.groups }}</p></div>
      <div class="card"><p class="text-xs text-slate-500">Hasabatlar</p><p class="text-2xl font-semibold">{{ data.counts.reports }}</p></div>
      <div class="card"><p class="text-xs text-slate-500">Dekanda</p><p class="text-2xl font-semibold text-amber-600">{{ data.counts.pending_dean }}</p></div>
      <div class="card"><p class="text-xs text-slate-500">Rektoratda</p><p class="text-2xl font-semibold text-blue-600">{{ data.counts.pending_rectorate }}</p></div>
      <div class="card"><p class="text-xs text-slate-500">Haýyşlar</p><p class="text-2xl font-semibold text-rose-600">{{ data.counts.pending_changes }}</p></div>
    </div>

    <div v-if="data" class="grid lg:grid-cols-2 gap-4">
      <div class="card">
        <h2 class="text-sm font-semibold mb-3">Soňky 14 günüň gatnaşygy</h2>
        <div class="flex items-end gap-2 h-40">
          <div v-for="t in data.trend" :key="t.report_date" class="flex-1 flex flex-col items-center justify-end gap-1">
            <div class="w-full bg-brand-500 rounded-t" :style="{ height: (Number(t.absences || 0) / maxAbsence()) * 100 + '%' }" :title="`${t.absences ?? 0} ýok`"></div>
            <span class="text-[10px] text-slate-400">{{ String(t.report_date).slice(8) }}</span>
          </div>
          <p v-if="!data.trend.length" class="text-sm text-slate-400">Maglumat ýok</p>
        </div>
      </div>
      <div class="card">
        <h2 class="text-sm font-semibold mb-3">Iň köp sebäpler</h2>
        <ul class="space-y-2">
          <li v-for="r in data.topReasons" :key="r.name" class="flex justify-between text-sm">
            <span class="text-slate-600">{{ r.name }}</span>
            <span class="font-medium">{{ r.n }}</span>
          </li>
          <li v-if="!data.topReasons.length" class="text-sm text-slate-400">Maglumat ýok</li>
        </ul>
      </div>
    </div>
  </div>
</template>
