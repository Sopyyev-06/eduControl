<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import type { ApiError } from '@/services/api';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
const username = ref('');
const password = ref('');
const error = ref('');
const busy = ref(false);

async function submit() {
  error.value = '';
  busy.value = true;
  try {
    const user = await auth.login(username.value.trim(), password.value);
    if (user.mustChangePassword) await router.push('/change-password');
    else await router.push(String(route.query.next || '/'));
  } catch (e) {
    const err = e as ApiError;
    if (err.message === 'Invalid credentials') {
      error.value = 'Ulanyjy ady ýa-da parol nädogry';
    } else if (err.details && err.details.length) {
      error.value = err.details.map((d: any) => d.message).join(', ');
    } else {
      error.value = err.message || 'Giriş ýalňyşlygy';
    }
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen grid place-items-center bg-slate-100 px-4">
    <div class="w-full max-w-sm">
      <div class="text-center mb-6">
        <div class="mx-auto h-12 w-12 rounded-xl bg-brand-700 grid place-items-center text-white font-bold">eC</div>
        <h1 class="mt-3 text-xl font-semibold text-slate-800">eduControl</h1>
        <p class="text-sm text-slate-500">Institut dolandyryş ulgamy</p>
      </div>
      <form class="card space-y-4" @submit.prevent="submit">
        <div>
          <label class="label" for="u">Ulanyjy ady</label>
          <input id="u" v-model="username" class="input" autocomplete="username" required autofocus />
        </div>
        <div>
          <label class="label" for="p">Parol</label>
          <input id="p" v-model="password" type="password" class="input" autocomplete="current-password" required />
        </div>
        <p v-if="error" class="text-sm text-rose-600">{{ error }}</p>
        <button class="btn-primary w-full" :disabled="busy">{{ busy ? 'Barlanýar…' : 'Gir' }}</button>
        <p class="text-[11px] text-slate-400 leading-relaxed">
          Diňe ygtyýarly işgärler. Ähli hereketler audit žurnalynda ýazylýar.
        </p>
      </form>
    </div>
  </div>
</template>
