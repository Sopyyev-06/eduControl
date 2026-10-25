import { defineStore } from 'pinia';
import { api } from '@/services/api';
import type { Meta } from '@/types';

export const useMetaStore = defineStore('meta', {
  state: () => ({ data: null as Meta | null, loaded: false }),
  actions: {
    async load(force = false) {
      if (this.loaded && !force) return this.data!;
      this.data = await api.get<Meta>('/api/meta');
      this.loaded = true;
      return this.data;
    },
  },
});
