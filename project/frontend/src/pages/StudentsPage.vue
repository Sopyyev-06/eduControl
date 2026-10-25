<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, type ApiError } from '@/services/api';
import { useAuthStore } from '@/stores/auth';
import { useMetaStore } from '@/stores/meta';
import type { Student } from '@/types';

const auth = useAuthStore();
const meta = useMetaStore();
const rows = ref<Student[]>([]);
const total = ref(0);
const groupId = ref(0);
const search = ref('');
const error = ref('');
const selected = ref<Student | null>(null);
const pii = ref<any>(null);
const piiError = ref('');
const revealBusy = ref(false);

async function load() {
  error.value = '';
  const qs = new URLSearchParams({ size: '100' });
  if (groupId.value) qs.set('groupId', String(groupId.value));
  if (search.value) qs.set('q', search.value);
  const res = await api.get<{ items: Student[]; total: number }>(`/api/students?${qs}`);
  rows.value = res.items;
  total.value = res.total;
}

async function openPersonal(s: Student) {
  selected.value = s;
  pii.value = null;
  piiError.value = '';
  if (!auth.canReadPii) return;
  try {
    pii.value = await api.get<any>(`/api/students/${s.id}/personal`);
  } catch (e) {
    piiError.value = (e as ApiError).message;
  }
}

async function reveal() {
  if (!selected.value) return;
  revealBusy.value = true;
  try {
    pii.value = await api.get<any>(`/api/students/${selected.value.id}/personal?reveal=1`);
  } catch (e) {
    piiError.value = (e as ApiError).message;
  } finally {
    revealBusy.value = false;
  }
}

onMounted(async () => {
  await meta.load();
  await load().catch((e) => (error.value = (e as ApiError).message));
});
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-xl font-semibold">Talyp-lar</h1>

    <div class="card flex flex-wrap gap-3 items-end">
      <div>
        <label class="label">Topar</label>
        <select v-model.number="groupId" class="input" @change="load()">
          <option :value="0">Ähli</option>
          <option v-for="g in meta.data?.groups ?? []" :key="g.id" :value="g.id">{{ g.name }}</option>
        </select>
      </div>
      <div class="flex-1 min-w-[180px]">
        <label class="label">Gözle</label>
        <input v-model="search" class="input" placeholder="Familiýa / belgi" @keyup.enter="load()" />
      </div>
      <button class="btn-ghost" @click="load()">Gözle</button>
      <p class="text-sm text-slate-500 ml-auto">Jemi: {{ total }}</p>
    </div>

    <p v-if="error" class="text-sm text-rose-600">{{ error }}</p>

    <div class="card p-0 overflow-x-auto">
      <table class="min-w-full">
        <thead class="bg-slate-50">
          <tr><th class="th">№</th><th class="th">Ady</th><th class="th">Topar</th><th class="th">Ýagdaý</th><th class="th"></th></tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="s in rows" :key="s.id" class="hover:bg-slate-50">
            <td class="td text-slate-500">{{ s.student_no }}</td>
            <td class="td">
              <span class="font-medium">{{ s.last_name }} {{ s.first_name }}</span>
              <span v-if="s.is_group_leader" class="badge bg-amber-100 text-amber-700 ml-2">Topar ýolbaşçysy</span>
            </td>
            <td class="td">{{ s.group_name }}</td>
            <td class="td text-slate-500">{{ s.status }}</td>
            <td class="td text-right"><button class="text-brand-600 hover:underline" @click="openPersonal(s)">Şahsy maglumat</button></td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="selected" class="card space-y-3">
      <div class="flex justify-between">
        <h2 class="text-sm font-semibold">{{ selected.last_name }} {{ selected.first_name }} — şahsy maglumat</h2>
        <button class="text-slate-400" @click="selected = null">✕</button>
      </div>

      <p v-if="!auth.canReadPii" class="text-sm text-slate-500">
        Siziň roluňyz üçin şahsy maglumat ýapyk.
      </p>
      <p v-else-if="piiError" class="text-sm text-rose-600">{{ piiError }}</p>
      <template v-else-if="pii">
        <p class="text-xs text-slate-500">
          Maglumatlar AES-256-GCM bilen şifrlenen we maskalanan görnüşde görkezilýär.
          Açmak audit žurnalynda ýazylýar.
        </p>
        <dl class="grid sm:grid-cols-2 gap-2 text-sm">
          <div><dt class="label">Doglan senesi</dt><dd>{{ pii.masked.birthDate ?? '—' }}</dd></div>
          <div><dt class="label">Jynsy</dt><dd>{{ pii.masked.gender ?? '—' }}</dd></div>
          <div><dt class="label">Telefon</dt><dd>{{ pii.masked.phone ?? '—' }}</dd></div>
          <div><dt class="label">Ene-ata</dt><dd>{{ pii.masked.parentName ?? '—' }}</dd></div>
          <div><dt class="label">Ene-ata telefony</dt><dd>{{ pii.masked.parentPhone ?? '—' }}</dd></div>
          <div><dt class="label">Salgysy</dt><dd>{{ pii.masked.address ?? '—' }}</dd></div>
          <div><dt class="label">Pasport</dt><dd>{{ pii.masked.passportNo ?? '—' }}</dd></div>
          <div><dt class="label">PINFL</dt><dd>{{ pii.masked.pinfl ?? '—' }}</dd></div>
        </dl>
        <button v-if="!pii.revealed" class="btn-ghost" :disabled="revealBusy" @click="reveal()">
          Doly görkez (audit ýazylar)
        </button>
        <p v-else class="text-xs text-amber-700">Doly maglumat açyldy — bu hereket audit žurnalynda ýazylan.</p>
      </template>
    </div>
  </div>
</template>
