<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api, type ApiError } from '@/services/api';
import { useMetaStore } from '@/stores/meta';
import type { Student } from '@/types';

const router = useRouter();
const meta = useMetaStore();

interface Row { studentId: number; status: 'present' | 'absent' | 'late'; absenceReasonId: number | null; comment: string; documentProvided: boolean }

const reportTypeId = ref<number>(0);
const groupId = ref<number>(0);
const reportDate = ref(new Date().toISOString().slice(0, 10));
const rows = ref<Row[]>([]);
const students = ref<Student[]>([]);
const error = ref('');
const busy = ref(false);
const search = ref('');

onMounted(async () => {
  await meta.load();
  reportTypeId.value = meta.data!.reportTypes[0]?.id ?? 0;
  if (meta.data!.groups.length === 1) groupId.value = meta.data!.groups[0].id;
});

watch(groupId, async (id) => {
  if (!id) return;
  const res = await api.get<{ items: Student[] }>(`/api/students?groupId=${id}&size=200`);
  students.value = res.items;
  rows.value = res.items.map((s) => ({ studentId: s.id, status: 'present', absenceReasonId: null, comment: '', documentProvided: false }));
});

const filtered = computed(() =>
  students.value
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => !search.value || `${s.last_name} ${s.first_name} ${s.student_no}`.toLowerCase().includes(search.value.toLowerCase())),
);

function reasonFor(id: number | null) {
  return meta.data?.reasons.find((r) => r.id === id) ?? null;
}

function markAll(status: 'present' | 'absent') {
  rows.value.forEach((r) => {
    r.status = status;
    if (status === 'present') {
      r.absenceReasonId = null;
      r.comment = '';
      r.documentProvided = false;
    }
  });
}

const absentCount = computed(() => rows.value.filter((r) => r.status !== 'present').length);

async function save(submitAfter: boolean) {
  error.value = '';
  busy.value = true;
  try {
    const payload = {
      reportTypeId: reportTypeId.value,
      groupId: groupId.value,
      reportDate: reportDate.value,
      items: rows.value.map((r) => ({
        studentId: r.studentId,
        status: r.status,
        absenceReasonId: r.status === 'present' ? null : r.absenceReasonId,
        comment: r.comment || null,
        documentProvided: r.documentProvided,
      })),
    };
    const created = await api.post<{ id: number }>('/api/reports', payload);
    if (submitAfter) await api.post(`/api/reports/${created.id}/action`, { action: 'submit' });
    router.push(`/reports/${created.id}`);
  } catch (e) {
    const err = e as ApiError;
    error.value = err.details?.length ? err.details.map((d) => `${d.path}: ${d.message}`).join('; ') : err.message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-xl font-semibold">Täze gatnaşyk hasabaty</h1>

    <div class="card grid gap-3 md:grid-cols-3">
      <div>
        <label class="label">Hasabat görnüşi</label>
        <select v-model.number="reportTypeId" class="input">
          <option v-for="t in meta.data?.reportTypes ?? []" :key="t.id" :value="t.id">{{ t.name }}</option>
        </select>
      </div>
      <div>
        <label class="label">Topar</label>
        <select v-model.number="groupId" class="input">
          <option :value="0" disabled>Saýlaň…</option>
          <option v-for="g in meta.data?.groups ?? []" :key="g.id" :value="g.id">{{ g.name }}</option>
        </select>
      </div>
      <div>
        <label class="label">Sene</label>
        <input v-model="reportDate" type="date" class="input" />
      </div>
    </div>

    <div v-if="rows.length" class="card p-0 overflow-x-auto">
      <div class="flex flex-wrap items-center gap-3 p-4 border-b border-slate-100">
        <input v-model="search" placeholder="Gözle…" class="input max-w-xs" />
        <button class="btn-ghost" @click="markAll('present')">Ählisi bar</button>
        <button class="btn-ghost" @click="markAll('absent')">Ählisi ýok</button>
        <span class="ml-auto text-sm text-slate-500">Ýok: <b class="text-rose-600">{{ absentCount }}</b> / {{ rows.length }}</span>
      </div>
      <table class="min-w-full">
        <thead class="bg-slate-50">
          <tr><th class="th">Talyp</th><th class="th">Ýagdaý</th><th class="th">Sebäp</th><th class="th">Komment</th><th class="th">Kepilnama</th></tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="{ s, i } in filtered" :key="s.id">
            <td class="td">
              <div class="font-medium">{{ s.last_name }} {{ s.first_name }}</div>
              <div class="text-xs text-slate-400">
                {{ s.student_no }}
                <span v-if="s.is_group_leader" class="badge bg-amber-100 text-amber-700 ml-1">Topar ýolbaşçysy</span>
              </div>
            </td>
            <td class="td">
              <select v-model="rows[i].status" class="input py-1">
                <option value="present">Bar</option>
                <option value="absent">Ýok</option>
                <option value="late">Gijikdi</option>
              </select>
            </td>
            <td class="td">
              <select v-if="rows[i].status !== 'present'" v-model.number="rows[i].absenceReasonId" class="input py-1">
                <option :value="null" disabled>Saýlaň…</option>
                <option v-for="r in meta.data?.reasons ?? []" :key="r.id" :value="r.id">{{ r.name }}</option>
              </select>
              <span v-else class="text-slate-300">—</span>
            </td>
            <td class="td">
              <input
                v-if="rows[i].status !== 'present'"
                v-model="rows[i].comment"
                class="input py-1"
                :placeholder="reasonFor(rows[i].absenceReasonId)?.requires_comment ? 'Hökmany!' : 'islege görä'"
              />
              <span v-else class="text-slate-300">—</span>
            </td>
            <td class="td">
              <label v-if="rows[i].status !== 'present' && reasonFor(rows[i].absenceReasonId)?.requires_document" class="flex items-center gap-2 text-sm">
                <input v-model="rows[i].documentProvided" type="checkbox" /> bar
              </label>
              <span v-else class="text-slate-300">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="text-sm text-slate-500">Topar saýlaň — talyp-laryň sanawy çykar.</p>

    <p v-if="error" class="text-sm text-rose-600">{{ error }}</p>

    <div class="flex gap-2">
      <button class="btn-ghost" :disabled="busy || !rows.length" @click="save(false)">Garalama hökmünde sakla</button>
      <button class="btn-primary" :disabled="busy || !rows.length" @click="save(true)">Tabşyr (dekana)</button>
    </div>
  </div>
</template>
