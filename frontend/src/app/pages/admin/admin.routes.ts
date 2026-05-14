import { Routes } from '@angular/router';

import { adminGuard } from '../../guards/admin.guard';
import { AdminShellComponent } from './admin-shell.component';

export const adminRoutes: Routes = [
  {
    path: '',
    component: AdminShellComponent,
    canActivate: [adminGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', loadComponent: () => import('./admin-overview.component').then((m) => m.AdminOverviewComponent) },
      { path: 'users', loadComponent: () => import('./admin-users.component').then((m) => m.AdminUsersComponent) },
      { path: 'posts', loadComponent: () => import('./admin-posts.component').then((m) => m.AdminPostsComponent) },
      { path: 'comments', loadComponent: () => import('./admin-comments.component').then((m) => m.AdminCommentsComponent) },
      { path: 'reports', loadComponent: () => import('./admin-reports.component').then((m) => m.AdminReportsComponent) },
      { path: 'analytics', loadComponent: () => import('./admin-analytics.component').then((m) => m.AdminAnalyticsComponent) },
      { path: 'hashtags', loadComponent: () => import('./admin-hashtags.component').then((m) => m.AdminHashtagsComponent) },
      { path: 'broadcast', loadComponent: () => import('./admin-broadcast.component').then((m) => m.AdminBroadcastComponent) },
      { path: 'moderation', loadComponent: () => import('./admin-moderation.component').then((m) => m.AdminModerationComponent) },
      { path: 'settings', loadComponent: () => import('./admin-settings.component').then((m) => m.AdminSettingsComponent) },
    ],
  },
];
