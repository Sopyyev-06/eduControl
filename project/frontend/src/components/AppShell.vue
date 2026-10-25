<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();
const open = ref(false);

const links = [
  { to: '/', label: 'Baş sahypa', show: () => true },
  { to: '/reports', label: 'Hasabatlar', show: () => true },
  { to: '/reports/new', label: 'Täze hasabat', show: () => auth.canCreateReport },
  { to: '/change-requests', label: 'Üýtgetme haýyşlary', show: () => true },
  { to: '/students', label: 'Talyp-lar', show: () => true },
  { to: '/admin', label: 'Dolandyryş', show: () => auth.canAdmin },
  { to: '/audit', label: 'Audit žurnaly', show: () => auth.canAudit },
];

async function doLogout() {
  await auth.logout();
  router.push('/login');
}
</script>

<template>
  <div class="min-h-screen lg:flex">
    <aside class="lg:w-64 bg-brand-800 text-white flex-shrink-0">
      <div class="px-5 py-4 flex items-center justify-between">
        <div>
          <p class="font-semibold tracking-tight">eduControl</p>
          <p class="text-[11px] text-brand-200">Institut dolandyryş ulgamy</p>
        </div>
        <button class="lg:hidden text-brand-200" @click="open = !open">☰</button>
      </div>
      <nav class="px-2 pb-4 space-y-1" :class="open ? 'block' : 'hidden lg:block'">
        <router-link
          v-for="l in links.filter((x) => x.show())"
          :key="l.to"
          :to="l.to"
          class="block rounded-lg px-3 py-2 text-sm text-brand-100 hover:bg-brand-700"
          active-class="bg-brand-600 text-white font-medium"
        >
          {{ l.label }}
        </router-link>
      </nav>
    </aside>

    <div class="flex-1 min-w-0">
      <header class="bg-white border-b border-slate-200 px-4 lg:px-8 py-3 flex items-center justify-between">
        <div class="text-sm text-slate-500">
          <span class="font-medium text-slate-800">{{ auth.user?.fullName }}</span>
          <span class="mx-2">·</span>
          <span>{{ auth.user?.roleLabel }}</span>
          <span v-if="auth.user?.facultyName" class="mx-2">·</span>
          <span v-if="auth.user?.facultyName">{{ auth.user.facultyName }}</span>
        </div>
        <button class="text-sm text-slate-500 hover:text-rose-600" @click="doLogout">Çykyş</button>
      </header>
      <main class="px-4 lg:px-8 py-6 max-w-7xl">
        <slot />
      </main>
    </div>
  </div>
</template>
