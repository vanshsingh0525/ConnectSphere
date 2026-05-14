import { Routes } from '@angular/router';

import { authGuard } from './guards/auth.guard';
import { EditProfileComponent } from './pages/edit-profile.component';
import { SettingsComponent } from './pages/settings.component';
import { NotificationsSettingsComponent } from './pages/notifications-settings.component';
import { CommentsSettingsComponent } from './pages/comments-settings.component';
import { YourActivityComponent } from './pages/your-activity.component';
import { VerifiedSuccessComponent } from './pages/verified-success.component';
import { adminGuard } from './guards/admin.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/landing-page.component').then((m) => m.LandingPageComponent),
  },
  {
    path: 'auth',
    loadComponent: () =>
      import('./pages/auth-page.component').then((m) => m.AuthPageComponent),
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./pages/auth-page.component').then((m) => m.AuthPageComponent),
  },
  {
    path: 'oauth2/callback',
    loadComponent: () =>
      import('./pages/auth-page.component').then((m) => m.AuthPageComponent),
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./pages/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'search',
    loadComponent: () =>
      import('./pages/search.component').then((m) => m.SearchComponent),
  },
  {
    path: 'hashtag/:tag',
    loadComponent: () =>
      import('./pages/search.component').then((m) => m.SearchComponent),
  },
  {
    path: 'profile/:username',
    loadComponent: () =>
      import('./pages/profile.component').then((m) => m.ProfileComponent),
  },
  {
    path: 'profile',
    loadComponent: () =>
      import('./pages/profile.component').then((m) => m.ProfileComponent),
    canActivate: [authGuard],
  },
  {
    path: 'followers/:userId',
    loadComponent: () =>
      import('./pages/follow-list.component').then((m) => m.FollowListComponent),
    data: { mode: 'followers' },
    canActivate: [authGuard],
  },
  {
    path: 'following/:userId',
    loadComponent: () =>
      import('./pages/follow-list.component').then((m) => m.FollowListComponent),
    data: { mode: 'following' },
    canActivate: [authGuard],
  },
  {
    path: 'post/:id',
    loadComponent: () =>
      import('./pages/post-view.component').then((m) => m.PostViewComponent),
  },
  {
    path: 'signup',
    loadComponent: () =>
      import('./pages/auth-page.component').then((m) => m.AuthPageComponent),
  },
  {
    path: 'settings',
    component: SettingsComponent,
    canActivate: [authGuard],
  },
  {
    path: 'settings/edit-profile',
    component: EditProfileComponent,
    canActivate: [authGuard],
  },
  {
    path: 'settings/notifications',
    component: NotificationsSettingsComponent,
    canActivate: [authGuard],
  },
  {
    path: 'settings/comments',
    component: CommentsSettingsComponent,
    canActivate: [authGuard],
  },
  {
    path: 'settings/activity',
    component: YourActivityComponent,
    canActivate: [authGuard],
  },
  {
    path: 'verified-success',
    component: VerifiedSuccessComponent,
    canActivate: [authGuard],
  },
  {
    path: 'admin',
    loadChildren: () =>
      import('./pages/admin/admin.routes').then((m) => m.adminRoutes),
    canActivate: [adminGuard],
  },
  {
    path: 'edit-profile',
    redirectTo: 'settings/edit-profile',
    pathMatch: 'full',
  },
  {
    path: 'notifications',
    redirectTo: 'settings/notifications',
    pathMatch: 'full',
  },
  {
    path: 'comments',
    redirectTo: 'settings/comments',
    pathMatch: 'full',
  },
  {
    path: 'activity',
    redirectTo: 'settings/activity',
    pathMatch: 'full',
  },
  { path: '**', redirectTo: '' },
];
