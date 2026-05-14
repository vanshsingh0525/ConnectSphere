import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, finalize, of, switchMap, takeUntil } from 'rxjs';

import { ImageFallbackDirective } from '../directives/image-fallback.directive';
import { SidebarComponent } from '../components/sidebar/sidebar.component';
import { VerifiedBadgeComponent } from '../components/verified-badge/verified-badge.component';
import { AuthService } from '../services/auth.service';
import {
  GlobalSearchResponse,
  SearchHashtagItem,
  SearchPostItem,
  SearchService,
  SearchUserItem,
} from '../services/search.service';

type SearchResultType = 'user' | 'hashtag' | 'post';

interface UnifiedResultItem {
  type: SearchResultType;
  id: string;
  imageUrl: string | null;
  title: string;
  subtitle: string;
  user?: SearchUserItem;
  hashtag?: SearchHashtagItem;
  post?: SearchPostItem;
  verified?: boolean;
}

@Component({
  selector: 'app-search-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, SidebarComponent, ImageFallbackDirective, VerifiedBadgeComponent],
  templateUrl: './search.component.html',
  styleUrl: './search.component.css',
})
export class SearchComponent implements OnInit, OnDestroy {
  private static readonly RECENT_STORAGE_KEY = 'searchRecentMixedV1';

  activeSidebarItem = 'Search';
  notificationCount = 0;
  readonly isAuthenticated: boolean;

  readonly queryControl = new FormControl('', { nonNullable: true });

  users: SearchUserItem[] = [];
  posts: SearchPostItem[] = [];
  hashtags: SearchHashtagItem[] = [];
  recentItems: UnifiedResultItem[] = [];

  loading = false;
  searchTouched = false;
  searchError = '';

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly authService: AuthService,
    private readonly searchService: SearchService,
  ) {
    this.isAuthenticated = this.authService.isAuthenticated();
  }

  ngOnInit(): void {
    this.loadRecentFromStorage();
    if (this.isAuthenticated) {
      this.loadRecentSearches();
    }

    this.queryControl.valueChanges
      .pipe(
        debounceTime(260),
        distinctUntilChanged(),
        switchMap((query) => {
          const trimmed = query.trim();
          this.searchTouched = trimmed.length > 0;
          this.searchError = '';

          if (!trimmed) {
            this.users = [];
            this.posts = [];
            this.hashtags = [];
            return of({ users: [], posts: [], hashtags: [] } as GlobalSearchResponse);
          }

          this.loading = true;
          return this.searchService.searchUsers(trimmed).pipe(
            switchMap((users) =>
              this.searchService.globalSearch(trimmed).pipe(
                switchMap((response) =>
                  of({
                    ...response,
                    users,
                  } satisfies GlobalSearchResponse),
                ),
              ),
            ),
            finalize(() => {
              this.loading = false;
            }),
          );
        }),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: (response) => {
          this.users = response.users ?? [];
          this.posts = response.posts ?? [];
          this.hashtags = response.hashtags ?? [];
        },
        error: () => {
          this.users = [];
          this.posts = [];
          this.hashtags = [];
          this.searchError = 'Unable to fetch search results right now.';
        },
      });

    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      const tag = params.get('tag');
      if (!tag) {
        return;
      }

      this.openHashtag(tag, false);
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

    if (item === 'Notifications') {
      this.notificationCount = 0;
      void this.router.navigate(['/settings/notifications']);
      return;
    }

    if (item === 'Profile') {
      const username = this.authService.getAuthUser()?.username?.trim().toLowerCase();
      if (username) {
        void this.router.navigate(['/profile', username]);
      } else {
        void this.router.navigate(['/login']);
      }
      return;
    }
  }

  get hasQuery(): boolean {
    return this.queryControl.value.trim().length > 0;
  }

  get showRecentSection(): boolean {
    return !this.hasQuery;
  }

  get combinedResults(): UnifiedResultItem[] {
    if (!this.hasQuery) {
      return [];
    }

    const userResults = this.users.map((user) => this.mapUserToRecent(user));
    const hashtagResults = this.hashtags.map((hashtag) => this.mapHashtagToRecent(hashtag));
    const postResults = this.posts.map((post) => this.mapPostToRecent(post));

    return [...userResults, ...hashtagResults, ...postResults];
  }

  get showNoResults(): boolean {
    return this.hasQuery && !this.loading && !this.searchError && this.combinedResults.length === 0;
  }

  openResult(item: UnifiedResultItem): void {
    if (item.type === 'user' && item.user) {
      this.openUser(item.user);
      return;
    }

    if (item.type === 'hashtag' && item.hashtag) {
      this.openHashtag(item.hashtag.name);
      return;
    }

    if (item.type === 'post' && item.post) {
      this.openPost(item.post);
    }
  }

  openRecent(item: UnifiedResultItem): void {
    if (item.type === 'user' && item.user) {
      void this.router.navigate(['/profile', item.user.username.trim().toLowerCase()]);
      return;
    }

    if (item.type === 'hashtag' && item.hashtag) {
      void this.router.navigate(['/hashtag', item.hashtag.name.trim().replace(/^#/, '').toLowerCase()]);
      return;
    }

    if (item.type === 'post' && item.post) {
      void this.router.navigate(['/post', item.post.id], {
        queryParams: { from: this.router.url },
      });
    }
  }

  openUser(user: SearchUserItem): void {
    this.addOrPromoteRecent(this.mapUserToRecent(user));

    if (!this.isAuthenticated) {
      void this.router.navigate(['/profile', user.username.trim().toLowerCase()]);
      return;
    }

    this.searchService.saveRecentSearch(user.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: (savedUser) => {
        this.addOrPromoteRecent(this.mapUserToRecent(savedUser));
        void this.router.navigate(['/profile', user.username.trim().toLowerCase()]);
      },
      error: () => {
        void this.router.navigate(['/profile', user.username.trim().toLowerCase()]);
      },
    });
  }

  openPost(post: SearchPostItem): void {
    this.addOrPromoteRecent(this.mapPostToRecent(post));
    void this.router.navigate(['/post', post.id], {
      queryParams: { from: this.router.url },
    });
  }

  openHashtag(tag: string, shouldNavigate = true): void {
    const normalizedTag = tag.trim().replace(/^#/, '');
    if (!normalizedTag) {
      return;
    }

    const hashtag: SearchHashtagItem = {
      name: normalizedTag,
      postCount: this.hashtags.find((entry) => entry.name.toLowerCase() === normalizedTag.toLowerCase())?.postCount ?? 0,
    };

    this.addOrPromoteRecent(this.mapHashtagToRecent(hashtag));
    this.queryControl.setValue(`#${normalizedTag}`, { emitEvent: false });
    this.loading = true;
    this.searchError = '';

    this.searchService.getPostsByHashtag(normalizedTag, 0, 50).pipe(
      finalize(() => {
        this.loading = false;
      }),
      takeUntil(this.destroy$),
    ).subscribe({
      next: (posts) => {
        this.users = [];
        this.hashtags = [hashtag];
        this.posts = posts ?? [];
      },
      error: () => {
        this.users = [];
        this.hashtags = [hashtag];
        this.posts = [];
        this.searchError = 'Unable to load posts for this hashtag right now.';
      },
    });

    if (shouldNavigate) {
      void this.router.navigate(['/hashtag', normalizedTag]);
    }
  }

  removeRecent(item: UnifiedResultItem, event: Event): void {
    event.stopPropagation();

    this.recentItems = this.recentItems.filter((entry) => entry.id !== item.id);
    this.persistRecentToStorage();

    if (!this.isAuthenticated || item.type !== 'user' || !item.user) {
      return;
    }

    this.searchService.removeRecentSearch(item.user.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        // Keep UI as already updated.
      },
      error: () => {
        // Keep UI non-blocking.
      },
    });
  }

  clearAllRecent(event: Event): void {
    event.stopPropagation();

    this.recentItems = [];
    this.persistRecentToStorage();

    if (!this.isAuthenticated) {
      return;
    }

    this.searchService.clearRecentSearches().pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        // Already cleared locally.
      },
      error: () => {
        // Keep local clear even if backend clear fails.
      },
    });
  }

  trackResult(index: number, item: UnifiedResultItem): string {
    return item.id;
  }

  trackRecent(index: number, item: UnifiedResultItem): string {
    return item.id;
  }

  postPreview(text: string | null | undefined): string {
    const value = (text ?? '').trim();
    if (!value) {
      return 'Open post';
    }

    return value.length > 70 ? `${value.slice(0, 70)}...` : value;
  }

  isUserVerified(user: SearchUserItem): boolean {
    return Boolean((user as SearchUserItem & { verified?: boolean }).verified);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private getPostTitle(post: SearchPostItem): string {
    const text = (post.text ?? '').trim();
    return text ? `Post #${post.id}` : `Post #${post.id}`;
  }

  private getPostSubtitle(post: SearchPostItem): string {
    return this.postPreview(post.text);
  }

  private mapUserToRecent(user: SearchUserItem): UnifiedResultItem {
    return {
      type: 'user',
      id: `user-${user.id}`,
      imageUrl: user.profileImageUrl,
      title: user.username,
      subtitle: user.name || 'ConnectSphere user',
      user,
      verified: this.isUserVerified(user),
    };
  }

  private mapHashtagToRecent(hashtag: SearchHashtagItem): UnifiedResultItem {
    return {
      type: 'hashtag',
      id: `hashtag-${hashtag.name.toLowerCase()}`,
      imageUrl: null,
      title: `#${hashtag.name}`,
      subtitle: `${hashtag.postCount} posts`,
      hashtag,
    };
  }

  private mapPostToRecent(post: SearchPostItem): UnifiedResultItem {
    return {
      type: 'post',
      id: `post-${post.id}`,
      imageUrl: post.mediaUrl,
      title: this.getPostTitle(post),
      subtitle: this.getPostSubtitle(post),
      post,
    };
  }

  private addOrPromoteRecent(item: UnifiedResultItem): void {
    this.recentItems = [item, ...this.recentItems.filter((entry) => entry.id !== item.id)].slice(0, 15);
    this.persistRecentToStorage();
  }

  private loadRecentSearches(): void {
    this.searchService.getRecentSearches(10).pipe(takeUntil(this.destroy$)).subscribe({
      next: (users) => {
        const serverItems = users.map((user) => this.mapUserToRecent(user));
        const mixed = [...serverItems, ...this.recentItems];
        this.recentItems = mixed
          .filter((item, index, list) => list.findIndex((entry) => entry.id === item.id) === index)
          .slice(0, 15);
        this.persistRecentToStorage();
      },
      error: () => {
        // Keep local recent results.
      },
    });
  }

  private persistRecentToStorage(): void {
    localStorage.setItem(SearchComponent.RECENT_STORAGE_KEY, JSON.stringify(this.recentItems));
  }

  private loadRecentFromStorage(): void {
    const raw = localStorage.getItem(SearchComponent.RECENT_STORAGE_KEY);
    if (!raw) {
      this.recentItems = [];
      return;
    }

    try {
      const parsed = JSON.parse(raw) as UnifiedResultItem[];
      this.recentItems = Array.isArray(parsed) ? parsed.slice(0, 15) : [];
    } catch {
      this.recentItems = [];
    }
  }
}
