<script setup lang="ts">
const props = defineProps<{ status: string }>();
const MAP: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Garalama', cls: 'bg-slate-100 text-slate-600' },
  submitted_to_dean: { label: 'Dekanda', cls: 'bg-amber-100 text-amber-700' },
  submitted_to_rectorate: { label: 'Rektoratda', cls: 'bg-blue-100 text-blue-700' },
  approved: { label: 'Tassyklandy', cls: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: 'Ret edildi', cls: 'bg-rose-100 text-rose-700' },
  pending: { label: 'Garaşýar', cls: 'bg-amber-100 text-amber-700' },
};
const info = () => MAP[props.status] ?? { label: props.status, cls: 'bg-slate-100 text-slate-600' };
</script>

<template>
  <span class="badge" :class="info().cls">{{ info().label }}</span>
</template>
