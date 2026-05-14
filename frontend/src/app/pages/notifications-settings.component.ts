import { CommonModule } from '@angular/common';
import { Location } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';

import { ImageFallbackDirective } from '../directives/image-fallback.directive';
import { SidebarComponent } from '../components/sidebar/sidebar.component';
import { AuthService } from '../services/auth.service';
import { FollowService } from '../services/follow.service';
import { NotificationItem, NotificationService } from '../services/notification.service';

@Component({
  selector: 'app-notifications-settings-page',
  standalone: true,
  imports: [CommonModule, SidebarComponent, ImageFallbackDirective],
  templateUrl: './notifications-settings.component.html',
  styleUrl: './notifications-settings.component.css',
})
export class NotificationsSettingsComponent implements OnInit {
  activeSidebarItem = 'Notifications';
  notificationCount = 0;
  loading = false;
  errorMessage = '';
  notifications: NotificationItem[] = [];
  requestActionIds = new Set<string>();

  constructor(
    private readonly location: Location,
    private readonly router: Router,
    private readonly authService: AuthService,
    private readonly notificationService: NotificationService,
    private readonly followService: FollowService,
  ) {}

  ngOnInit(): void {
    this.loadNotifications();
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

  goBack(): void {
    if (window.history.length > 1) {
      this.location.back();
      return;
    }

    void this.router.navigate(['/settings']);
  }

  trackByNotification(index: number, item: NotificationItem): string {
    return item.id;
  }

  notificationLabel(type: NotificationItem['type']): string {
    if (type === 'FOLLOW') {
      return 'Follow';
    }

    if (type === 'FOLLOW_REQUEST') {
      return 'Request';
    }

    if (type === 'LIKE') {
      return 'Like';
    }

    if (type === 'LIKE_POST') {
      return 'Post Like';
    }

    if (type === 'COMMENT_POST') {
      return 'Post Comment';
    }

    if (type === 'LIKE_COMMENT') {
      return 'Comment Like';
    }

    if (type === 'STORY_REACTION') {
      return 'Story Like';
    }

    return 'Comment';
  }

  timeAgo(value: string): string {
    const timestamp = new Date(value).getTime();
    const diffMinutes = Math.max(1, Math.floor((Date.now() - timestamp) / 60000));

    if (diffMinutes < 60) {
      return `${diffMinutes}m ago`;
    }

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) {
      return `${diffDays}d ago`;
    }

    return new Date(value).toLocaleDateString();
  }

  acceptRequest(notification: NotificationItem): void {
    if (!notification.actionable || this.requestActionIds.has(notification.id)) {
      return;
    }

    this.requestActionIds.add(notification.id);
    this.followService.acceptFollowRequest(notification.actorUserId).subscribe({
      next: () => {
        this.requestActionIds.delete(notification.id);
        this.notifications = this.notifications.filter((item) => item.id !== notification.id);
        this.notificationCount = this.notifications.length;
      },
      error: () => {
        this.requestActionIds.delete(notification.id);
        this.errorMessage = 'Unable to accept follow request right now.';
      },
    });
  }

  deleteRequest(notification: NotificationItem): void {
    if (!notification.actionable || this.requestActionIds.has(notification.id)) {
      return;
    }

    this.requestActionIds.add(notification.id);
    this.followService.deleteFollowRequest(notification.actorUserId).subscribe({
      next: () => {
        this.requestActionIds.delete(notification.id);
        this.notifications = this.notifications.filter((item) => item.id !== notification.id);
        this.notificationCount = this.notifications.length;
      },
      error: () => {
        this.requestActionIds.delete(notification.id);
        this.errorMessage = 'Unable to remove follow request right now.';
      },
    });
  }

  isRequestBusy(notificationId: string): boolean {
    return this.requestActionIds.has(notificationId);
  }

  openNotification(notification: NotificationItem): void {
    if (notification.actionable) {
      return;
    }

    const navigate = () => {
      if (notification.type === 'STORY_REACTION' && notification.storyId) {
        const currentUserId = this.authService.getAuthUser()?.id ?? null;
        void this.router.navigate(['/dashboard'], {
          queryParams: { storyId: notification.storyId, storyUserId: currentUserId },
        });
        return;
      }

      const postId = notification.relatedPostId ?? (notification.targetType === 'POST' ? notification.targetId : null);
      if (postId != null) {
        void this.router.navigate(['/post', postId], {
          queryParams: { from: this.router.url },
        });
        return;
      }

      void this.router.navigate(['/profile', notification.actorUsername]);
    };

    if (notification.read) {
      navigate();
      return;
    }

    this.notificationService.markAsRead(notification.id).subscribe({
      next: () => {
        notification.read = true;
        this.notificationCount = this.notifications.filter((item) => !item.read).length;
        navigate();
      },
      error: () => {
        navigate();
      },
    });
  }

  private loadNotifications(): void {
    this.loading = true;
    this.errorMessage = '';

    this.notificationService.getNotifications().subscribe({
      next: (notifications) => {
        this.notifications = notifications;
        this.notificationCount = notifications.filter((item) => !item.read).length;
        this.loading = false;
      },
      error: (error: HttpErrorResponse) => {
        this.notifications = [];
        this.notificationCount = 0;
        this.loading = false;
        this.errorMessage = error.status === 0
          ? 'Notification service is unreachable. Check api-gateway and notification-service.'
          : 'Unable to load notifications right now.';
      },
    });
  }
}
