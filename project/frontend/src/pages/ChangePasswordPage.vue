<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import type { ApiError } from '@/services/api';

const auth = useAuthStore();
const router = useRouter();
const current = ref('');
const next = ref('');
const confirm = ref('');
const error = ref('');
const busy = ref(false);

async function submit() {
  error.value = '';
  if (next.value !== confirm.value) {
    error.value = 'Täze parollar deň däl';
    return;
  }
  busy.value = true;
  try {
    await auth.changePassword(current.value, next.value);
    await router.push('/');
  } catch (e) {
    const err = e as ApiError;
    error.value = err.details?.length ? err.details.map((d) => d.message).join('; ') : err.message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen grid place-items-center bg-slate-100 px-4">
    <form class="card w-full max-w-md space-y-4" @submit.prevent="submit">
      <div>
        <h1 class="text-lg font-semibold">Paroly çalyşmak</h1>
        <p class="text-sm text-slate-500">Wagtlaýyn parol bilen girdiňiz — hökmany çalyşmaly.</p>
      </div>
      <div>
        <label class="label">Häzirki parol</label>
        <input v-model="current" type="password" class="input" required />
      </div>
      <div>
        <label class="label">Täze parol (min 10, uly/har ýazgy/sifr)</label>
        <input v-model="next" type="password" class="input" required />
      </div>
      <div>
        <label class="label">Täze paroly gaýtalaň</label>
        <input v-model="confirm" type="password" class="input" required />
      </div>
      <p v-if="error" class="text-sm text-rose-600">{{ error }}</p>
      <button class="btn-primary w-full" :disabled="busy">{{ busy ? 'Ýazylýar…' : 'Ýatda sakla' }}</button>
    </form>
  </div>
</template>
