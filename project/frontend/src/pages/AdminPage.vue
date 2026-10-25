<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { api, type ApiError } from '@/services/api';
import { useMetaStore } from '@/stores/meta';

const meta = useMetaStore();
const users = ref<any[]>([]);
const reasons = ref<any[]>([]);
const error = ref('');
const tempPassword = ref('');
const busy = ref(false);

const form = reactive({ username: '', fullName: '', role: 'dean', facultyId: null as number | null });
const reasonForm = reactive({ name: '', requiresDocument: false, requiresComment: false });

async function loadAll() {
  error.value = '';
  try {
    users.value = await api.get<any[]>('/api/admin/users');
    reasons.value = await api.get<any[]>('/api/admin/absence-reasons');
  } catch (e) {
    error.value = (e as ApiError).message;
  }
}

async function createUser() {
  error.value = '';
  tempPassword.value = '';
  busy.value = true;
  try {
    const res = await api.post<{ temporaryPassword: string }>('/api/admin/users', { ...form });
    tempPassword.value = res.temporaryPassword;
    form.username = '';
    form.fullName = '';
    await loadAll();
  } catch (e) {
    error.value = (e as ApiError).message;
  } finally {
    busy.value = false;
  }
}

async function toggleUser(u: any) {
  await api.patch(`/api/admin/users/${u.id}`, { isActive: !u.is_active });
  await loadAll();
}

async function resetPassword(u: any) {
  const res = await api.patch<{ temporaryPassword: string }>(`/api/admin/users/${u.id}`, { resetPassword: true });
  tempPassword.value = res.temporaryPassword ?? '';
}

async function createReason() {
  error.value = '';
  try {
    await api.post('/api/admin/absence-reasons', reasonForm);
    reasonForm.name = '';
    await loadAll();
  } catch (e) {
    error.value = (e as ApiError).message;
  }
}

async function toggleReason(r: any) {
  await api.patch(`/api/admin/absence-reasons/${r.id}`, { isActive: !r.is_active });
  await loadAll();
}

onMounted(async () => {
  await meta.load();
  await loadAll();
});
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-xl font-semibold">Dolandyryş paneli</h1>
    <p v-if="error" class="text-sm text-rose-600">{{ error }}</p>
    <p v-if="tempPassword" class="card bg-amber-50 border-amber-200 text-sm">
      Wagtlaýyn parol: <code class="font-mono font-bold">{{ tempPassword }}</code> — bir gezek görkezilýär, işgäre howpsuz ýolda geçiriň.
    </p>

    <div class="card">
      <h2 class="text-sm font-semibold mb-3">Täze ulanyjy</h2>
      <div class="grid md:grid-cols-4 gap-3">
        <div><label class="label">Ulanyjy ady</label><input v-model="form.username" class="input" /></div>
        <div><label class="label">Doly ady</label><input v-model="form.fullName" class="input" /></div>
        <div>
          <label class="label">Rol</label>
          <select v-model="form.role" class="input">
            <option value="rector">Rektor</option>
            <option value="prorector">Prorektor</option>
            <option value="rectorate_staff">Rektorat işgäri</option>
            <option value="dean">Dekan</option>
            <option value="vice_dean">Orunbasar dekan</option>
            <option value="teacher">Mugallym</option>
          </select>
        </div>
        <div>
          <label class="label">Fakultet</label>
          <select v-model.number="form.facultyId" class="input">
            <option :value="null">—</option>
            <option v-for="f in meta.data?.faculties ?? []" :key="f.id" :value="f.id">{{ f.name }}</option>
          </select>
        </div>
      </div>
      <button class="btn-primary mt-3" :disabled="busy" @click="createUser">Döret</button>
    </div>

    <div class="card p-0 overflow-x-auto">
      <table class="min-w-full">
        <thead class="bg-slate-50">
          <tr><th class="th">Ulanyjy</th><th class="th">Rol</th><th class="th">Fakultet</th><th class="th">Soňky giriş</th><th class="th">Ýagdaý</th><th class="th"></th></tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="u in users" :key="u.id">
            <td class="td"><span class="font-medium">{{ u.full_name }}</span><div class="text-xs text-slate-400">{{ u.username }}</div></td>
            <td class="td">{{ u.role_label }}</td>
            <td class="td text-slate-500">{{ u.faculty_name ?? '—' }}</td>
            <td class="td text-slate-500 text-xs">{{ u.last_login_at ? new Date(u.last_login_at).toLocaleString() : '—' }}</td>
            <td class="td">
              <span :class="u.is_active ? 'text-emerald-600' : 'text-rose-600'">{{ u.is_active ? 'Işjeň' : 'Öçük' }}</span>
            </td>
            <td class="td text-right space-x-3">
              <button class="text-brand-600 text-xs hover:underline" @click="resetPassword(u)">Parol resmin</button>
              <button class="text-slate-500 text-xs hover:underline" @click="toggleUser(u)">{{ u.is_active ? 'Öçür' : 'Işjeňleşdir' }}</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="card">
      <h2 class="text-sm font-semibold mb-3">Gatnaşyk sebäpleri</h2>
      <div class="grid md:grid-cols-4 gap-3 items-end">
        <div class="md:col-span-2"><label class="label">Ady</label><input v-model="reasonForm.name" class="input" /></div>
        <label class="flex items-center gap-2 text-sm"><input v-model="reasonForm.requiresDocument" type="checkbox" /> Kepilnama gerek</label>
        <label class="flex items-center gap-2 text-sm"><input v-model="reasonForm.requiresComment" type="checkbox" /> Komment hökmany</label>
      </div>
      <button class="btn-primary mt-3" @click="createReason">Goş</button>
      <ul class="mt-4 divide-y divide-slate-100">
        <li v-for="r in reasons" :key="r.id" class="py-2 flex items-center gap-3 text-sm">
          <span :class="r.is_active ? '' : 'line-through text-slate-400'">{{ r.name }}</span>
          <span v-if="r.requires_document" class="badge bg-blue-100 text-blue-700">kepilnama</span>
          <span v-if="r.requires_comment" class="badge bg-amber-100 text-amber-700">komment</span>
          <button class="ml-auto text-xs text-slate-500 hover:underline" @click="toggleReason(r)">
            {{ r.is_active ? 'Arhiwle' : 'Dikelt' }}
          </button>
        </li>
      </ul>
      <p class="text-xs text-slate-400 mt-2">Öçürmek ýok — diňe arhiwleme (taryh saklanýar).</p>
    </div>
  </div>
</template>
