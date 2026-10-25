<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import AppShell from '@/components/AppShell.vue';

const route = useRoute();
const bare = computed(() => route.meta.public === true || route.name === 'change-password');
</script>

<template>
  <component :is="bare ? 'div' : AppShell">
    <router-view />
  </component>
</template>
