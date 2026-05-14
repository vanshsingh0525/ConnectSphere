import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-admin-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './admin-shell.component.html',
  styleUrl: './admin-shell.component.css',
})
export class AdminShellComponent {
  sidebarOpen = false;

  readonly navItems = [
    { label: 'Dashboard', icon: 'DB', link: '/admin/dashboard' },
    { label: 'Users', icon: 'US', link: '/admin/users' },
    { label: 'Posts', icon: 'PS', link: '/admin/posts' },
    { label: 'Comments', icon: 'CM', link: '/admin/comments' },
    { label: 'Reports', icon: 'RP', link: '/admin/reports' },
    { label: 'Analytics', icon: 'AN', link: '/admin/analytics' },
    { label: 'Hashtags', icon: 'HT', link: '/admin/hashtags' },
    { label: 'Broadcast', icon: 'BC', link: '/admin/broadcast' },
    { label: 'Moderation', icon: 'MD', link: '/admin/moderation' },
    { label: 'Settings', icon: 'ST', link: '/admin/settings' },
  ];

  constructor(private readonly authService: AuthService, private readonly router: Router) {}

  get adminName(): string {
    return this.authService.getAuthUser()?.username ?? 'admin';
  }

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
  }

  closeSidebar(): void {
    this.sidebarOpen = false;
  }

  backToApp(): void {
    void this.router.navigate(['/dashboard']);
  }
}
