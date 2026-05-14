import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, catchError, combineLatest, forkJoin, of, switchMap, takeUntil } from 'rxjs';

import { ImageFallbackDirective } from '../directives/image-fallback.directive';
import { SidebarComponent } from '../components/sidebar/sidebar.component';
import { AuthService, PublicUserProfile } from '../services/auth.service';
import { FollowPagedResponse, FollowService, FollowUserItem } from '../services/follow.service';
import { VerifiedBadgeComponent } from '../components/verified-badge/verified-badge.component';

interface FollowListItem extends FollowUserItem {
  isFollowing: boolean;
  isPending: boolean;
  followBusy: boolean;
  isCurrentUser: boolean;
  verified?: boolean;
}

@Component({
  selector: 'app-follow-list-page',
  standalone: true,
  imports: [CommonModule, SidebarComponent, ImageFallbackDirective, VerifiedBadgeComponent],
  templateUrl: './follow-list.component.html',
  styleUrl: './follow-list.component.css',
})
export class FollowListComponent implements OnInit, OnDestroy {
  activeSidebarItem = 'Profile';
  notificationCount = 0;
  loading = true;
  errorMessage = '';
  pageTitle = 'Followers';
  pageSubtitle = 'People connected to this profile.';
  items: FollowListItem[] = [];
  currentUserId: number | null = null;
  viewedUserId: number | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly followService: FollowService,
    private readonly authService: AuthService,
  ) {}

  ngOnInit(): void {
    this.currentUserId = this.authService.getAuthUser()?.id ?? null;

    combineLatest([this.route.paramMap, this.route.data])
      .pipe(
        takeUntil(this.destroy$),
        switchMap(([params, data]) => {
          const rawUserId = params.get('userId');
          const userId = Number(rawUserId);
          const mode = (data['mode'] as 'followers' | 'following' | undefined) ?? 'followers';

          if (!rawUserId || Number.isNaN(userId) || userId <= 0) {
            this.errorMessage = 'Invalid user id.';
            this.loading = false;
            return of(null);
          }

          this.viewedUserId = userId;
          this.pageTitle = mode === 'followers' ? 'Followers' : 'Following';
          this.pageSubtitle = mode === 'followers'
            ? 'People following this account.'
            : 'Accounts this user follows.';
          this.loading = true;
          this.errorMessage = '';

          const request$ = mode === 'followers'
            ? this.followService.getFollowers(userId)
            : this.followService.getFollowing(userId);

          return request$.pipe(
            catchError(() => {
              this.errorMessage = 'Unable to load follow list right now.';
              return of(null);
            }),
          );
        }),
      )
      .subscribe((response) => {
        if (!response) {
          this.items = [];
          this.loading = false;
          return;
        }

        this.hydrateItems(response);
      });
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

    if (item === 'Profile') {
      const username = this.authService.getAuthUser()?.username?.trim();
      if (username) {
        void this.router.navigate(['/profile', username]);
      }
      return;
    }

    if (item === 'Notifications') {
      this.notificationCount = 0;
      void this.router.navigate(['/settings/notifications']);
      return;
    }
  }

  openProfile(username: string): void {
    if (!username.trim()) {
      return;
    }

    void this.router.navigate(['/profile', username]);
  }

  toggleFollow(item: FollowListItem, event: Event): void {
    event.stopPropagation();

    if (item.isCurrentUser || item.followBusy) {
      return;
    }

    item.followBusy = true;

    const request$ = item.isFollowing || item.isPending
      ? this.followService.unfollowUser(item.userId)
      : this.followService.followUser(item.userId);

    request$.subscribe({
      next: (response) => {
        item.isFollowing = response.isFollowing;
        item.isPending = response.isPending;
        item.followBusy = false;
      },
      error: () => {
        item.followBusy = false;
      },
    });
  }

  trackByUserId(index: number, item: FollowListItem): number {
    return item.userId;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private hydrateItems(response: FollowPagedResponse): void {
    const baseItems = response.content.map((item) => ({
      ...item,
      name: item.name?.trim() ? item.name : item.username,
      profileImageUrl: item.profileImageUrl,
      isFollowing: false,
      isPending: false,
      followBusy: false,
      isCurrentUser: this.currentUserId === item.userId,
    }));

    const followStatusRequests = baseItems.map((item) =>
      item.isCurrentUser
        ? of({ userId: item.userId, isFollowing: false, isPending: false })
        : this.followService.getFollowStatus(item.userId).pipe(
            catchError(() => of({ isFollowing: false, isPending: false, canViewContent: false, targetPublic: true })),
            switchMap((status) => of({ userId: item.userId, isFollowing: status.isFollowing, isPending: status.isPending })),
          ),
    );

    if (followStatusRequests.length === 0) {
      this.items = [];
      this.loading = false;
      return;
    }

    forkJoin([forkJoin(followStatusRequests), this.authService.getPublicProfiles().pipe(catchError(() => of([] as PublicUserProfile[])))])
      .subscribe(([statuses, publicProfiles]) => {
        const statusMap = new Map(statuses.map((status) => [status.userId, status]));
        const verifiedMap = new Map(publicProfiles.map((profile) => [profile.username.toLowerCase(), !!profile.verified]));
        this.items = baseItems.map((item) => ({
          ...item,
          isFollowing: statusMap.get(item.userId)?.isFollowing ?? false,
          isPending: statusMap.get(item.userId)?.isPending ?? false,
          verified: verifiedMap.get(item.username.toLowerCase()) ?? false,
        }));
        this.loading = false;
      });
  }
}
