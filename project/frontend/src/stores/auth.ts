import { defineStore } from 'pinia';
import { api, setCsrf } from '@/services/api';
import type { User } from '@/types';

interface LoginResult { user: User; csrfToken: string }

export const useAuthStore = defineStore('auth', {
  state: () => ({ user: null as User | null, loading: false, ready: false }),
  getters: {
    isLoggedIn: (s) => !!s.user,
    role: (s) => s.user?.role ?? '',
    canCreateReport: (s) => ['vice_dean', 'dean'].includes(s.user?.role ?? ''),
    canApproveDean: (s) => s.user?.role === 'dean',
    isRectorate: (s) => ['rector', 'prorector', 'rectorate_staff'].includes(s.user?.role ?? ''),
    canReadPii: (s) => ['rector', 'rectorate_staff', 'dean'].includes(s.user?.role ?? ''),
    canAdmin: (s) => ['rector', 'rectorate_staff'].includes(s.user?.role ?? ''),
    canAudit: (s) => ['rector', 'prorector', 'rectorate_staff'].includes(s.user?.role ?? ''),
  },
  actions: {
    async login(username: string, password: string) {
      const res = await api.post<LoginResult>('/api/auth/login', { username, password });
      this.user = res.user;
      setCsrf(res.csrfToken);
      return res.user;
    },
    async fetchMe() {
      try {
        const res = await api.get<LoginResult>('/api/auth/me');
        this.user = res.user;
        setCsrf(res.csrfToken ?? '');
      } catch {
        this.user = null;
      } finally {
        this.ready = true;
      }
    },
    async changePassword(currentPassword: string, newPassword: string) {
      const res = await api.post<LoginResult>('/api/auth/change-password', { currentPassword, newPassword });
      this.user = res.user;
      setCsrf(res.csrfToken);
    },
    async logout() {
      await api.post('/api/auth/logout').catch(() => undefined);
      this.user = null;
    },
  },
});
