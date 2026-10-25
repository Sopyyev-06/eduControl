import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const routes = [
  { path: '/login', name: 'login', component: () => import('@/pages/LoginPage.vue'), meta: { public: true } },
  { path: '/change-password', name: 'change-password', component: () => import('@/pages/ChangePasswordPage.vue') },
  { path: '/', name: 'dashboard', component: () => import('@/pages/DashboardPage.vue') },
  { path: '/reports', name: 'reports', component: () => import('@/pages/ReportsPage.vue') },
  { path: '/reports/new', name: 'report-new', component: () => import('@/pages/ReportNewPage.vue') },
  { path: '/reports/:id', name: 'report', component: () => import('@/pages/ReportDetailPage.vue') },
  { path: '/change-requests', name: 'change-requests', component: () => import('@/pages/ChangeRequestsPage.vue') },
  { path: '/students', name: 'students', component: () => import('@/pages/StudentsPage.vue') },
  { path: '/admin', name: 'admin', component: () => import('@/pages/AdminPage.vue') },
  { path: '/audit', name: 'audit', component: () => import('@/pages/AuditPage.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (!auth.ready) await auth.fetchMe();
  if (to.meta.public) return auth.isLoggedIn ? { name: 'dashboard' } : true;
  if (!auth.isLoggedIn) return { name: 'login', query: { next: to.fullPath } };
  if (auth.user?.mustChangePassword && to.name !== 'change-password') return { name: 'change-password' };
  if (to.name === 'admin' && !auth.canAdmin) return { name: 'dashboard' };
  if (to.name === 'audit' && !auth.canAudit) return { name: 'dashboard' };
  return true;
});

export default router;
