<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, type ApiError } from '@/services/api';
import { useAuthStore } from '@/stores/auth';
import { useMetaStore } from '@/stores/meta';
import StatusBadge from '@/components/StatusBadge.vue';
import type { ReportItem } from '@/types';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const meta = useMetaStore();

const report = ref<any>(null);
const items = ref<ReportItem[]>([]);
const transitions = ref<any[]>([]);
const error = ref('');
const busy = ref(false);

// change request draft
const changeMode = ref(false);
const changes = ref<{ reportItemId: number; field: string; newValue: string }[]>([]);

const id = Number(route.params.id);

async function load() {
  const res = await api.get<{ report: any; items: ReportItem[]; transitions: any[] }>(`/api/reports/${id}`);
  report.value = res.report;
  items.value = res.items;
  transitions.value = res.transitions;
}

onMounted(async () => {
  await meta.load();
  await load().catch((e) => (error.value = (e as ApiError).message));
});

const canSubmit = computed(() => report.value?.status === 'draft' && auth.canCreateReport);
const canDean = computed(() => report.value?.status === 'submitted_to_dean' && auth.canApproveDean);
const canRectorate = computed(() => report.value?.status === 'submitted_to_rectorate' && auth.isRectorate);
const canRequestChange = computed(
  () => ['submitted_to_dean', 'submitted_to_rectorate', 'approved'].includes(report.value?.status) && auth.canCreateReport,
);

async function rejectAndAct(action: string) {
  const reason = window.prompt('Ret sebäbi (hökmany):') ?? '';
  if (!reason.trim()) { error.value = 'Ret sebäbi hökmany'; return; }
  await act(action, reason);
}

async function act(action: string, comment?: string) {
  error.value = '';
  busy.value = true;
  try {
    await api.post(`/api/reports/${id}/action`, { action, comment });
    await load();
  } catch (e) {
    const err = e as ApiError;
    error.value = err.message;
  } finally {
    busy.value = false;
  }
}

function toggleChange(item: ReportItem, field: string, newValue: string) {
  const key = items.value.findIndex((x) => x.id === item.id);
  const idx = changes.value.findIndex((c) => c.reportItemId === item.id && c.field === field);
  if (idx >= 0) changes.value.splice(idx, 1);
  else changes.value.push({ reportItemId: items.value[key].id, field, newValue });
}

async function submitChangeRequest() {
  error.value = '';
  busy.value = true;
  try {
    if (!changes.value.length) throw { message: 'Üýtgeşme saýlanylmady' } as ApiError;
    await api.post('/api/change-requests', { reportId: id, changes: changes.value });
    changeMode.value = false;
    changes.value = [];
    await load();
  } catch (e) {
    error.value = (e as ApiError).message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div v-if="report" class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <router-link to="/reports" class="text-sm text-brand-600 hover:underline">← Hasabatlar</router-link>
        <h1 class="text-xl font-semibold mt-1">{{ report.type_name }} — {{ report.group_name }}</h1>
        <p class="text-sm text-slate-500">
          {{ report.report_date }} · {{ report.faculty_name }} · awtor: {{ report.created_by_name }} · v{{ report.version }}
        </p>
      </div>
      <StatusBadge :status="report.status" />
    </div>

    <p v-if="error" class="text-sm text-rose-600">{{ error }}</p>

    <div class="flex flex-wrap gap-2">
      <button v-if="canSubmit" class="btn-primary" :disabled="busy" @click="act('submit')">Dekana tabşyr</button>
      <button v-if="canDean" class="btn-primary" :disabled="busy" @click="act('dean_approve')">Tassykla → rektorat</button>
      <button v-if="canRectorate" class="btn-primary" :disabled="busy" @click="act('rectorate_approve')">Final tassykla</button>
      <button v-if="canDean" class="btn-danger" :disabled="busy" @click="rejectAndAct('dean_reject')">Ret et</button>
      <button v-if="canRectorate" class="btn-danger" :disabled="busy" @click="rejectAndAct('rectorate_reject')">Ret et</button>
      <button v-if="canRequestChange" class="btn-ghost" @click="changeMode = !changeMode">
        Üýtgetme haýyşy ({{ changes.length }})
      </button>
      <button v-if="changeMode && changes.length" class="btn-primary" :disabled="busy" @click="submitChangeRequest">Haýyşy iber</button>
    </div>

    <div class="card p-0 overflow-x-auto">
      <table class="min-w-full">
        <thead class="bg-slate-50">
          <tr><th class="th">Talyp</th><th class="th">Ýagdaý</th><th class="th">Sebäp</th><th class="th">Komment</th><th v-if="changeMode" class="th">Üýtget</th></tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="it in items" :key="it.id">
            <td class="td">
              <div class="font-medium">{{ it.last_name }} {{ it.first_name }}</div>
              <div class="text-xs text-slate-400">{{ it.student_no }}</div>
            </td>
            <td class="td">
              <span :class="it.status === 'present' ? 'text-emerald-600' : 'text-rose-600 font-medium'">
                {{ it.status === 'present' ? 'Bar' : it.status === 'late' ? 'Gijikdi' : 'Ýok' }}
              </span>
            </td>
            <td class="td">{{ it.reason_name ?? '—' }}</td>
            <td class="td text-slate-500">{{ it.comment ?? '—' }}</td>
            <td v-if="changeMode" class="td">
              <button
                v-if="it.status !== 'present'"
                class="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-brand-100"
                @click="toggleChange(it, 'status', 'present')"
              >
                → Bar
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="card">
      <h2 class="text-sm font-semibold mb-2">Taryh</h2>
      <ol class="space-y-2 text-sm">
        <li v-for="t in transitions" :key="t.id" class="text-slate-600">
          <span class="text-slate-400">{{ new Date(t.created_at).toLocaleString() }}</span> ·
          <b>{{ t.actor_name }}</b> · {{ t.from_status }} → {{ t.to_status }}
          <span v-if="t.comment"> — „{{ t.comment }}"</span>
        </li>
        <li v-if="!transitions.length" class="text-slate-400">Hereket ýok</li>
      </ol>
    </div>
  </div>
</template>
