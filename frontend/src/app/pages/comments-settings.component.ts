import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';

import { SidebarComponent } from '../components/sidebar/sidebar.component';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-comments-settings-page',
  standalone: true,
  imports: [CommonModule, SidebarComponent],
  templateUrl: './comments-settings.component.html',
  styleUrl: './comments-settings.component.css',
})
export class CommentsSettingsComponent implements OnInit {
  activeSidebarItem = 'Settings';
  notificationCount = 0;
  commentsEnabled = true;
  loading = false;
  saving = false;
  errorMessage = '';
  successMessage = '';

  constructor(
    private readonly router: Router,
    private readonly authService: AuthService,
  ) {}

  ngOnInit(): void {
    this.loadCommentSettings();
  }

  onSidebarSelection(item: string): void {
    this.activeSidebarItem = item;

    if (item === 'About Us') {
      void this.router.navigate(['/dashboard'], { queryParams: { view: 'about' } });
      return;
    }

    if (item === 'Home') {
      void this.router.navigate(['/dashboard']);
      return;
    }

    if (item === 'Search') {
      void this.router.navigate(['/search']);
      return;
    }

    if (item === 'Notifications') {
      void this.router.navigate(['/settings/notifications']);
      return;
    }

    if (item === 'Profile') {
      const username = this.authService.getAuthUser()?.username?.trim();
      if (username) {
        void this.router.navigate(['/profile', username]);
      }
      return;
    }
  }

  toggleComments(): void {
    const nextValue = !this.commentsEnabled;
    this.saving = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.authService.updateCommentSettings(nextValue).subscribe({
      next: (response) => {
        this.commentsEnabled = response.commentsEnabled;
        localStorage.setItem('commentSettings', JSON.stringify(response));
        this.saving = false;
        this.successMessage = this.commentsEnabled
          ? 'Comments are enabled for your account.'
          : 'Comments are disabled for your account.';
      },
      error: (error: HttpErrorResponse) => {
        this.saving = false;
        this.errorMessage = error.status === 0
          ? 'Unable to reach the user service right now.'
          : 'Unable to update comment settings.';
      },
    });
  }

  goBack(): void {
    void this.router.navigate(['/settings']);
  }

  private loadCommentSettings(): void {
    this.loading = true;
    this.errorMessage = '';

    this.authService.getCommentSettings().subscribe({
      next: (response) => {
        this.commentsEnabled = response.commentsEnabled;
        localStorage.setItem('commentSettings', JSON.stringify(response));
        this.loading = false;
      },
      error: () => {
        const cached = localStorage.getItem('commentSettings');
        if (cached) {
          try {
            const parsed = JSON.parse(cached) as { commentsEnabled?: boolean };
            this.commentsEnabled = parsed.commentsEnabled ?? true;
          } catch {
            this.commentsEnabled = true;
          }
        }

        this.loading = false;
      },
    });
  }
}
