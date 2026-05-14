import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, catchError, finalize, forkJoin, of, takeUntil } from 'rxjs';

import { AboutSectionComponent } from '../components/about-section/about-section.component';
import { FeedComponent } from '../components/feed/feed.component';
import { SidebarComponent } from '../components/sidebar/sidebar.component';
import { StoryViewerComponent } from '../components/story-viewer/story-viewer.component';
import { SuggestionsComponent } from '../components/suggestions/suggestions.component';
import {
  AnnouncementItem,
  FeedPostItem,
  PlatformUpdateItem,
  StoryMediaItem,
  StoryItem,
  SuggestedUserItem,
} from '../models/dashboard-ui.model';
import { AuthService, AuthUser, PublicUserProfile } from '../services/auth.service';
import { MediaService } from '../services/media.service';
import { PostItem, PostService } from '../services/post.service';
import { NotificationService } from '../services/notification.service';
import { SearchHashtagItem, SearchService, SearchUserItem } from '../services/search.service';
import { StoryService } from '../services/story.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    SidebarComponent,
    FeedComponent,
    SuggestionsComponent,
    AboutSectionComponent,
    StoryViewerComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnInit, OnDestroy {
  @ViewChild('storyUploadInput') storyUploadInput?: ElementRef<HTMLInputElement>;

  private mentionRequestToken = 0;
  private hashtagRequestToken = 0;
  private readonly destroy$ = new Subject<void>();
  private readonly darkModeStorageKey = 'connectsphere.darkMode';

  readonly user: AuthUser | null;
  readonly isAuthenticated: boolean;
  activeSidebarItem = 'Home';
  activeView: 'feed' | 'about' = 'feed';
  darkMode = false;
  notificationCount = 0;
  searchQuery = '';
  selectedCreateFileName = '';
  createCaption = '';
  selectedCreateFilePreviewUrl: string | null = null;
  selectedCreateFileIsVideo = false;
  selectedCreateFile: File | null = null;
  createWizardOpen = false;
  createStep = 1;
  editMode = false;
  editingPostId: number | null = null;
  editingPostMediaUrl: string | null = null;
  createLocation = '';
  createAspectRatio: 'original' | 'square' | 'portrait' = 'square';
  createFilter: 'normal' | 'warm' | 'cool' | 'mono' = 'normal';
  createHashtagInput = '';
  createMentionInput = '';
  selectedHashtags: string[] = [];
  selectedTaggedUsers: SearchUserItem[] = [];
  mentionSuggestions: SearchUserItem[] = [];
  hashtagSuggestions: SearchHashtagItem[] = [];
  mentionSuggestionsLoading = false;
  hashtagSuggestionsLoading = false;
  creatingPost = false;
  storyUploadInProgress = false;
  storyUploadErrorMessage = '';
  storyUploadSuccessMessage = '';
  createErrorMessage = '';
  createSuccessMessage = '';
  feedErrorMessage = '';
  isCreateDropzoneActive = false;
  private createSuccessTimer: ReturnType<typeof setTimeout> | null = null;

  stories: StoryItem[] = [];
  storyViewerOpen = false;
  storyViewerStartUserId: number | null = null;

  posts: FeedPostItem[] = [];

  suggestedUsers: SuggestedUserItem[] = [];

  readonly updates: PlatformUpdateItem[] = [
    {
      id: 1,
      title: 'New Feature: Stories added',
      description: 'Create quick visual updates and share moments that disappear after 24 hours.',
      dateLabel: 'Apr 19, 2026',
    },
    {
      id: 2,
      title: 'Improved feed performance',
      description: 'Optimized feed rendering and loading for smoother infinite scroll behavior.',
      dateLabel: 'Apr 17, 2026',
    },
    {
      id: 3,
      title: 'Real-time notifications launched',
      description: 'Receive instant updates for likes, comments, follows, and mentions.',
      dateLabel: 'Apr 15, 2026',
    },
  ];

  readonly announcements: AnnouncementItem[] = [
    {
      id: 1,
      title: 'Scheduled maintenance window',
      description: 'Planned maintenance on Apr 27 from 1:00 AM to 2:00 AM UTC for reliability upgrades.',
      dateLabel: 'Apr 20, 2026',
    },
    {
      id: 2,
      title: 'Community guidelines refresh',
      description: 'Our policy pages are updated to improve clarity around creator safety and moderation.',
      dateLabel: 'Apr 16, 2026',
    },
  ];

  constructor(
    private readonly authService: AuthService,
    private readonly mediaService: MediaService,
    private readonly postService: PostService,
    private readonly notificationService: NotificationService,
    private readonly searchService: SearchService,
    private readonly storyService: StoryService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
  ) {
    this.user = this.authService.getAuthUser();
    this.isAuthenticated = this.authService.isAuthenticated();
    this.darkMode = localStorage.getItem(this.darkModeStorageKey) === 'true';
    this.loadUnreadNotificationCount();
    this.loadDashboardData();
  }

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      const createPost = params.get('createPost');
      if (createPost === '1') {
        this.setView('feed');
        if (!this.createWizardOpen) {
          this.openCreateWizard();
        }
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { createPost: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
        return;
      }

      const editPostId = Number(params.get('editPostId'));
      if (!Number.isNaN(editPostId) && editPostId > 0) {
        this.setView('feed');
        if (this.editingPostId !== editPostId || !this.createWizardOpen || !this.editMode) {
          this.openEditWizard(editPostId);
        }
        return;
      }

      const requestedView = params.get('view');
      if (requestedView === 'about') {
        this.setView('about');
        return;
      }

      this.setView('feed');
    });
  }

  get filteredPosts(): FeedPostItem[] {
    const query = this.searchQuery.trim().toLowerCase();
    if (!query) {
      return this.posts;
    }

    return this.posts.filter((post) => {
      const hashtags = post.hashtags.join(' ').toLowerCase();
      return (
        post.userName.toLowerCase().includes(query) ||
        post.userHandle.toLowerCase().includes(query) ||
        post.content.toLowerCase().includes(query) ||
        hashtags.includes(query)
      );
    });
  }

  setView(view: 'feed' | 'about'): void {
    this.activeView = view;
    this.activeSidebarItem = view === 'about' ? 'About Us' : 'Home';
  }

  showFeed(): void {
    this.setView('feed');
    void this.router.navigate(['/dashboard'], {
      queryParams: { view: null },
      queryParamsHandling: 'merge',
    });
  }

  showAbout(): void {
    this.setView('about');
    void this.router.navigate(['/dashboard'], {
      queryParams: { view: 'about' },
      queryParamsHandling: 'merge',
    });
  }

  toggleDarkMode(): void {
    this.darkMode = !this.darkMode;
    localStorage.setItem(this.darkModeStorageKey, String(this.darkMode));
  }

  onSidebarSelection(item: string): void {
    this.activeSidebarItem = item;

    if (item === 'Create') {
      this.openCreateWizard();
      return;
    }

    if (item === 'About Us') {
      this.showAbout();
      return;
    }

    if (item === 'Notifications') {
      if (!this.requireAuthenticationForAction()) {
        return;
      }
      this.notificationCount = 0;
      void this.router.navigate(['/settings/notifications']);
      return;
    }

    if (item === 'Home') {
      this.showFeed();
      return;
    }

    if (item === 'Search') {
      void this.router.navigate(['/search']);
      return;
    }

    if (item === 'Profile') {
      if (!this.requireAuthenticationForAction()) {
        return;
      }
      const username = this.authService.getAuthUser()?.username?.trim().toLowerCase();
      if (username) {
        void this.router.navigate(['/profile', username]);
      }
      return;
    }

    const matchedUser = this.suggestedUsers.find((user) => user.username.replace('@', '') === item);
    if (matchedUser) {
      void this.router.navigate(['/profile', matchedUser.username.replace('@', '')]);
    }
  }

  openUserProfile(username: string): void {
    const normalized = username.replace('@', '').trim().toLowerCase();
    if (normalized) {
      void this.router.navigate(['/profile', normalized]);
    }
  }

  onStorySelected(story: StoryItem): void {
    this.storyViewerStartUserId = story.userId ?? null;
    this.storyViewerOpen = this.storyViewerStartUserId != null;
  }

  onAddStoryRequested(): void {
    if (!this.requireAuthenticationForAction()) {
      return;
    }

    if (this.storyUploadInProgress) {
      return;
    }

    this.storyUploadInput?.nativeElement.click();
  }

  onStoryFileChange(event: Event): void {
    if (!this.requireAuthenticationForAction()) {
      return;
    }

    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    this.storyUploadErrorMessage = '';
    this.storyUploadSuccessMessage = '';

    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      this.storyUploadErrorMessage = 'Please choose an image or video file.';
      input.value = '';
      return;
    }

    const maxSizeBytes = 10 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      this.storyUploadErrorMessage = 'File size must be less than 10MB.';
      input.value = '';
      return;
    }

    this.storyUploadInProgress = true;
    this.storyService.createStory(file).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.storyUploadInProgress = false;
        this.storyUploadSuccessMessage = 'Story uploaded successfully.';
        input.value = '';
        this.loadDashboardData();
      },
      error: () => {
        this.storyUploadInProgress = false;
        this.storyUploadErrorMessage = 'Unable to upload story right now.';
        input.value = '';
      },
    });
  }

  onStoryViewerClosed(): void {
    this.storyViewerOpen = false;
    this.storyViewerStartUserId = null;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { storyUserId: null, storyId: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  onEditRequested(postId: number): void {
    if (!this.requireAuthenticationForAction()) {
      return;
    }

    if (!Number.isFinite(postId) || postId <= 0) {
      return;
    }

    this.setView('feed');
    void this.router.navigate(['/dashboard'], {
      queryParams: { editPostId: postId },
    });
  }

  openCreateWizard(): void {
    if (!this.requireAuthenticationForAction()) {
      return;
    }

    this.exitEditMode();
    this.createWizardOpen = true;
    this.createStep = this.selectedCreateFile ? Math.max(this.createStep, 1) : 1;
    this.createErrorMessage = '';
    this.createSuccessMessage = '';
  }

  closeCreateWizard(): void {
    if (this.creatingPost) {
      return;
    }

    this.createWizardOpen = false;
    this.exitEditMode();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { editPostId: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  goToCreateStep(step: number): void {
    const boundedStep = Math.max(1, Math.min(4, step));
    this.createStep = boundedStep;
    this.createErrorMessage = '';
  }

  nextCreateStep(): void {
    if (this.createStep === 1 && !this.editMode && !this.selectedCreateFile) {
      this.createErrorMessage = 'Please select an image or video first.';
      return;
    }

    if (this.createStep === 3 && !this.createCaption.trim()) {
      this.createErrorMessage = 'Please enter a caption.';
      return;
    }

    this.goToCreateStep(this.createStep + 1);
  }

  isWizardNextDisabled(): boolean {
    if (this.creatingPost) {
      return true;
    }

    if (this.createStep === 1) {
      return !this.selectedCreateFilePreviewUrl;
    }

    if (this.createStep === 3) {
      return !this.createCaption.trim();
    }

    return false;
  }

  previousCreateStep(): void {
    this.goToCreateStep(this.createStep - 1);
  }

  onCreateFileSelected(file: File): void {
    if (this.editMode) {
      return;
    }

    if (this.selectedCreateFilePreviewUrl) {
      URL.revokeObjectURL(this.selectedCreateFilePreviewUrl);
    }

    this.selectedCreateFileName = file.name;
    this.selectedCreateFile = file;
    this.selectedCreateFileIsVideo = file.type.startsWith('video/');
    this.selectedCreateFilePreviewUrl = URL.createObjectURL(file);
    this.createErrorMessage = '';
    this.createSuccessMessage = '';
    this.createWizardOpen = true;
    this.createStep = 1;
  }

  onCreateFileChange(event: Event): void {
    if (this.editMode) {
      return;
    }

    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    this.onCreateFileSelected(file);
    input.value = '';
  }

  onCreateDropzoneDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isCreateDropzoneActive = true;
  }

  onCreateDropzoneDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isCreateDropzoneActive = false;
  }

  onCreateDropzoneDrop(event: DragEvent): void {
    event.preventDefault();
    this.isCreateDropzoneActive = false;

    if (this.editMode) {
      return;
    }

    const file = event.dataTransfer?.files?.[0];
    if (!file) {
      return;
    }

    this.onCreateFileSelected(file);
  }

  clearCreatePreview(): void {
    if (this.selectedCreateFilePreviewUrl) {
      URL.revokeObjectURL(this.selectedCreateFilePreviewUrl);
    }

    this.selectedCreateFileName = '';
    this.selectedCreateFile = null;
    this.selectedCreateFilePreviewUrl = null;
    this.selectedCreateFileIsVideo = false;
    this.createCaption = '';
    this.createLocation = '';
    this.createAspectRatio = 'square';
    this.createFilter = 'normal';
    this.createHashtagInput = '';
    this.createMentionInput = '';
    this.selectedHashtags = [];
    this.selectedTaggedUsers = [];
    this.mentionSuggestions = [];
    this.hashtagSuggestions = [];
    this.mentionSuggestionsLoading = false;
    this.hashtagSuggestionsLoading = false;
    this.createStep = 1;
    this.createWizardOpen = false;
    this.exitEditMode();
    this.createErrorMessage = '';
    this.createSuccessMessage = '';
  }

  addHashtagChip(rawValue: string): void {
    const sanitized = this.sanitizeHashtag(rawValue);
    if (!sanitized) {
      this.createHashtagInput = '';
      return;
    }

    if (!this.selectedHashtags.includes(sanitized)) {
      this.selectedHashtags = [...this.selectedHashtags, sanitized];
    }

    this.createHashtagInput = '';
    this.hashtagSuggestions = [];
  }

  removeHashtagChip(tag: string): void {
    this.selectedHashtags = this.selectedHashtags.filter((existing) => existing !== tag);
  }

  onHashtagInputChange(): void {
    const raw = this.createHashtagInput.trim();
    if (!raw) {
      this.hashtagSuggestions = [];
      return;
    }

    const query = raw.replace(/^#/, '');
    const requestToken = ++this.hashtagRequestToken;
    this.hashtagSuggestionsLoading = true;

    this.searchService.searchHashtags(query, 0, 6).pipe(
      catchError(() => of([] as SearchHashtagItem[])),
      finalize(() => {
        if (requestToken === this.hashtagRequestToken) {
          this.hashtagSuggestionsLoading = false;
        }
      }),
    ).subscribe((hashtags) => {
      if (requestToken !== this.hashtagRequestToken) {
        return;
      }

      this.hashtagSuggestions = hashtags.filter((item) => !this.selectedHashtags.includes(item.name));
    });
  }

  addTaggedUser(user: SearchUserItem): void {
    if (this.selectedTaggedUsers.some((existing) => existing.username === user.username)) {
      this.createMentionInput = '';
      this.mentionSuggestions = [];
      return;
    }

    this.selectedTaggedUsers = [...this.selectedTaggedUsers, user];
    this.createMentionInput = '';
    this.mentionSuggestions = [];
  }

  addTaggedUserByInput(): void {
    const normalized = this.createMentionInput.trim().replace(/^@/, '').toLowerCase();
    if (!normalized) {
      this.createMentionInput = '';
      return;
    }

    if (this.selectedTaggedUsers.some((existing) => existing.username.toLowerCase() === normalized)) {
      this.createMentionInput = '';
      this.mentionSuggestions = [];
      return;
    }

    const suggested = this.mentionSuggestions.find(
      (user) => user.username.trim().toLowerCase() === normalized,
    );

    if (suggested) {
      this.addTaggedUser(suggested);
      return;
    }

    this.selectedTaggedUsers = [
      ...this.selectedTaggedUsers,
      {
        id: -Date.now(),
        username: normalized,
        name: normalized,
        profileImageUrl: null,
        bio: null,
      },
    ];
    this.createMentionInput = '';
    this.mentionSuggestions = [];
  }

  removeTaggedUser(username: string): void {
    this.selectedTaggedUsers = this.selectedTaggedUsers.filter((user) => user.username !== username);
  }

  onMentionInputChange(): void {
    const raw = this.createMentionInput.trim();
    if (!raw) {
      this.mentionSuggestions = [];
      return;
    }

    const query = raw.replace(/^@/, '');
    const requestToken = ++this.mentionRequestToken;
    this.mentionSuggestionsLoading = true;

    this.searchService.searchUsers(query, 0, 6).pipe(
      catchError(() => of([] as SearchUserItem[])),
      finalize(() => {
        if (requestToken === this.mentionRequestToken) {
          this.mentionSuggestionsLoading = false;
        }
      }),
    ).subscribe((users) => {
      if (requestToken !== this.mentionRequestToken) {
        return;
      }

      this.mentionSuggestions = users.filter(
        (user) => !this.selectedTaggedUsers.some((selected) => selected.username === user.username),
      );
    });
  }

  applyCreateFilterStyle(): string {
    if (this.createFilter === 'warm') {
      return 'saturate(1.08) contrast(1.02) sepia(0.14)';
    }

    if (this.createFilter === 'cool') {
      return 'saturate(0.96) contrast(1.04) hue-rotate(8deg)';
    }

    if (this.createFilter === 'mono') {
      return 'grayscale(1) contrast(1.05)';
    }

    return 'none';
  }

  createPreviewAspectRatio(): string {
    if (this.createAspectRatio === 'portrait') {
      return '4 / 5';
    }

    if (this.createAspectRatio === 'original') {
      return this.selectedCreateFileIsVideo ? '16 / 9' : 'auto';
    }

    return '1 / 1';
  }

  submitCreatePost(): void {
    if (this.editMode) {
      this.submitEditPost();
      return;
    }

    if (!this.selectedCreateFile) {
      this.createErrorMessage = 'Please select an image or video first.';
      return;
    }

    if (!this.createCaption.trim()) {
      this.createErrorMessage = 'Please enter a caption.';
      return;
    }

    this.creatingPost = true;
    this.createErrorMessage = '';
    this.createSuccessMessage = '';

    this.mediaService
      .upload(this.selectedCreateFile)
      .subscribe({
        next: (uploadResponse) => {
          const hashtags = this.combinedHashtags();
          const taggedUsers = this.combinedTaggedUsers();

          this.postService
            .createPost({
              text: this.createCaption.trim(),
              mediaUrl: uploadResponse.fileUrl,
              location: this.createLocation.trim() || undefined,
              hashtags,
              taggedUsers,
            })
            .pipe(
              finalize(() => {
                this.creatingPost = false;
              }),
            )
            .subscribe({
              next: (createdPost) => {
                const authorName = this.user?.firstName && this.user?.lastName
                  ? `${this.user.firstName} ${this.user.lastName}`
                  : this.user?.username ?? 'You';
                this.posts = [
                  {
                    id: createdPost.id,
                    authorId: this.user?.id ?? createdPost.authorId,
                    userName: authorName,
                    userHandle: `@${this.user?.username ?? 'connectsphere'}`,
                    userAvatarColor: '#4f7bff',
                    userAvatarUrl: this.user?.profileImageUrl,
                    timeAgo: 'Just now',
                    content: createdPost.text,
                    mediaType: this.selectedCreateFileIsVideo ? 'video' : 'image',
                    mediaUrl: createdPost.mediaUrl ?? undefined,
                    location: createdPost.location ?? undefined,
                    hashtags: createdPost.hashtags ?? hashtags,
                    taggedUsers: createdPost.taggedUsers ?? taggedUsers,
                    likes: createdPost.likesCount ?? 0,
                    isLiked: false,
                    isSaved: createdPost.saved ?? false,
                    comments: createdPost.commentsCount ?? 0,
                    shares: createdPost.sharesCount ?? 0,
                  },
                  ...this.posts,
                ];

                this.clearCreatePreview();
                this.createWizardOpen = false;
                this.showCreateSuccess('Post created successfully.');
              },
              error: (error: { error?: { message?: string } }) => {
                this.createErrorMessage = error?.error?.message ?? 'Unable to create post right now.';
              },
            });
        },
        error: (error: { error?: { message?: string } }) => {
          this.creatingPost = false;
          this.createErrorMessage = error?.error?.message ?? 'Unable to upload media right now.';
        },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.createSuccessTimer) {
      clearTimeout(this.createSuccessTimer);
      this.createSuccessTimer = null;
    }
    if (this.selectedCreateFilePreviewUrl) {
      URL.revokeObjectURL(this.selectedCreateFilePreviewUrl);
    }
  }

  private loadDashboardData(): void {
    this.feedErrorMessage = '';
    const failures: string[] = [];

    const publicUsers$ = this.authService.getPublicProfiles().pipe(
      catchError(() => {
        failures.push('users');
        return of([] as PublicUserProfile[]);
      }),
    );

    const feedPosts$ = this.postService.getLandingFeed().pipe(
      catchError(() => {
        failures.push('posts');
        return of([] as PostItem[]);
      }),
    );

    const stories$ = this.storyService.getStoriesFeed().pipe(
      catchError((error: HttpErrorResponse) => {
        // For guest users, unauthenticated stories response is expected
        // and should not show temporary outage banners.
        if (!this.isAuthenticated && (error.status === 401 || error.status === 403)) {
          return of([]);
        }
        failures.push('stories');
        return of([]);
      }),
    );

    forkJoin({
      publicUsers: publicUsers$,
      feedPosts: feedPosts$,
      stories: stories$,
    }).subscribe({
      next: ({ publicUsers, feedPosts, stories }) => {
        const userMap = new Map(publicUsers.map((user) => [user.id, user]));
        this.posts = [...feedPosts]
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .map((post) => this.toFeedPost(post, userMap));
        const ownStoryEntry: StoryItem = {
          id: 'add-story',
          userId: this.user?.id,
          name: 'Your story',
          username: this.user?.username,
          avatarColor: '#4f7bff',
          avatarUrl: this.user?.profileImageUrl || undefined,
          isAddStory: true,
          stories: [],
        };

        const feedStories = stories
          .filter((storyUser) => storyUser.userId !== this.user?.id)
          .map((storyUser): StoryItem => {
          const mappedStories: StoryMediaItem[] = storyUser.stories.map((story): StoryMediaItem => ({
            storyId: story.storyId,
            reactionTargetId: story.reactionTargetId,
            mediaUrl: story.mediaUrl,
            mediaType: story.mediaType,
            caption: story.caption,
            createdAt: story.createdAt,
            expiresAt: story.expiresAt,
            viewCount: story.viewCount,
            viewedByCurrentUser: story.viewedByCurrentUser,
          }));

          return {
            id: `story-user-${storyUser.userId}`,
            userId: storyUser.userId,
            name: storyUser.username,
            username: storyUser.username,
            avatarColor: this.colorFromText(storyUser.username),
            avatarUrl: storyUser.profilePic || undefined,
            verified: userMap.get(storyUser.userId)?.verified ?? false,
            hasUnseen: storyUser.hasUnseen,
            stories: mappedStories,
          };
        });

        this.stories = [ownStoryEntry, ...feedStories];
        const requestedStoryUserId = Number(this.route.snapshot.queryParamMap.get('storyUserId'));
        if (!Number.isNaN(requestedStoryUserId) && requestedStoryUserId > 0) {
          const targetGroup = this.stories.find((story) => story.userId === requestedStoryUserId && (story.stories?.length ?? 0) > 0);
          if (targetGroup) {
            this.storyViewerStartUserId = requestedStoryUserId;
            this.storyViewerOpen = true;
          }
        }
        this.suggestedUsers = publicUsers.map((user) => ({
          id: user.id,
          username: `@${user.username}`,
          tagline: user.bio || 'Public profile',
          avatarColor: this.colorFromText(user.username),
          avatarUrl: user.profileImageUrl,
          verified: user.verified ?? false,
        }));

        if (this.suggestedUsers.length === 0 && this.posts.length > 0) {
          this.suggestedUsers = this.suggestionsFromPosts(this.posts);
        }

        if (this.posts.length === 0) {
          this.feedErrorMessage =
            failures.length > 0
              ? 'Feed is temporarily unavailable. Restart api-gateway, auth-service, post-service, and story-service.'
              : '';
          return;
        }

        if (failures.length > 0) {
          this.feedErrorMessage = 'Some sections are temporarily unavailable, but your feed is still loaded.';
        }
      },
      error: () => {
        this.feedErrorMessage = 'Unable to load feed data right now.';
      },
    });
  }

  private suggestionsFromPosts(posts: FeedPostItem[]): SuggestedUserItem[] {
    const seen = new Set<string>();
    const suggestions: SuggestedUserItem[] = [];

    for (const post of posts) {
      if (seen.has(post.userHandle)) {
        continue;
      }

      seen.add(post.userHandle);
      suggestions.push({
        id: suggestions.length + 1,
        username: post.userHandle,
        tagline: 'Public creator',
        avatarColor: post.userAvatarColor,
      });

      if (suggestions.length >= 6) {
        break;
      }
    }

    return suggestions;
  }

  private toFeedPost(post: PostItem, userMap: Map<number, PublicUserProfile>): FeedPostItem {
    const user = userMap.get(post.authorId);
    const username = user?.username ?? `user${post.authorId}`;
    const fullName = user?.name?.trim() || username;
    const hashtags = (post.hashtags?.length ?? 0) > 0 ? post.hashtags ?? [] : this.extractHashtags(post.text);

    return {
      id: post.id,
      authorId: post.authorId,
      userName: fullName,
      userHandle: `@${username}`,
      userAvatarColor: this.colorFromText(username),
      userAvatarUrl: user?.profileImageUrl,
      userVerified: user?.verified ?? false,
      timeAgo: this.timeAgo(post.createdAt),
      content: post.text,
      mediaType: this.mediaType(post.mediaUrl),
      mediaUrl: post.mediaUrl ?? undefined,
      location: post.location ?? undefined,
      hashtags,
      taggedUsers: post.taggedUsers ?? [],
      likes: post.likesCount ?? 0,
      isLiked: false,
      isSaved: post.saved ?? false,
      comments: post.commentsCount ?? 0,
      shares: post.sharesCount ?? 0,
    };
  }

  private loadUnreadNotificationCount(): void {
    this.notificationService.getUnreadCount().pipe(
      catchError(() => of(0)),
    ).subscribe((count) => {
      this.notificationCount = Math.max(0, count);
    });
  }

  private mediaType(mediaUrl: string | null): 'image' | 'video' | 'none' {
    if (!mediaUrl || !mediaUrl.trim()) {
      return 'none';
    }

    const normalized = mediaUrl.toLowerCase();
    if (normalized.endsWith('.mp4') || normalized.includes('/video/')) {
      return 'video';
    }

    return 'image';
  }

  private extractHashtags(text: string): string[] {
    const matches = text.match(/#(\w+)/g);
    if (!matches) {
      return [];
    }

    return matches.map((tag) => tag.replace('#', '').toLowerCase());
  }

  private extractMentions(text: string): string[] {
    const matches = text.match(/@([A-Za-z0-9_.]+)/g);
    if (!matches) {
      return [];
    }

    return matches.map((mention) => mention.replace('@', '').toLowerCase());
  }

  private sanitizeHashtag(raw: string): string {
    return raw.trim().replace(/^#/, '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  }

  private combinedHashtags(): string[] {
    const parsed = this.extractHashtags(this.createCaption);
    const combined = new Set<string>([...this.selectedHashtags, ...parsed].map((tag) => this.sanitizeHashtag(tag)).filter(Boolean));
    return [...combined];
  }

  combinedHashtagsForPreview(): string[] {
    return this.combinedHashtags().slice(0, 8);
  }

  private combinedTaggedUsers(): string[] {
    const parsed = this.extractMentions(this.createCaption);
    const selected = this.selectedTaggedUsers.map((user) => user.username);
    const typed = this.createMentionInput ? [this.createMentionInput] : [];
    const combined = new Set<string>(
      [...selected, ...parsed, ...typed]
        .map((username) => username.trim().replace(/^@/, '').toLowerCase())
        .filter(Boolean),
    );
    return [...combined];
  }

  private openEditWizard(postId: number): void {
    this.creatingPost = true;
    this.createErrorMessage = '';
    this.createSuccessMessage = '';

    this.postService.getPostById(postId).pipe(
      catchError(() => of(null)),
    ).subscribe((post) => {
      this.creatingPost = false;
      if (!post) {
        this.createErrorMessage = 'Unable to load post for editing.';
        return;
      }

      this.editMode = true;
      this.editingPostId = post.id;
      this.editingPostMediaUrl = post.mediaUrl ?? null;
      this.selectedCreateFile = null;
      this.selectedCreateFileName = post.mediaUrl ? 'Existing media' : '';
      this.selectedCreateFilePreviewUrl = post.mediaUrl ?? null;
      this.selectedCreateFileIsVideo = this.mediaType(post.mediaUrl) === 'video';
      this.createCaption = post.text ?? '';
      this.createLocation = post.location ?? '';
      this.selectedHashtags = [...(post.hashtags ?? [])];
      this.selectedTaggedUsers = (post.taggedUsers ?? []).map((username) => ({
        id: -Date.now() - Math.floor(Math.random() * 100000),
        username: username.trim().replace(/^@/, '').toLowerCase(),
        name: username.trim().replace(/^@/, '').toLowerCase(),
        profileImageUrl: null,
        bio: null,
      }));
      this.createMentionInput = '';
      this.createHashtagInput = '';
      this.mentionSuggestions = [];
      this.hashtagSuggestions = [];
      this.createWizardOpen = true;
      this.createStep = 3;
    });
  }

  private submitEditPost(): void {
    if (this.editingPostId == null) {
      this.createErrorMessage = 'No post selected for editing.';
      return;
    }

    if (!this.createCaption.trim()) {
      this.createErrorMessage = 'Please enter a caption.';
      return;
    }

    this.creatingPost = true;
    this.createErrorMessage = '';
    this.createSuccessMessage = '';

    const hashtags = this.combinedHashtags();
    const taggedUsers = this.combinedTaggedUsers();
    const editingPostId = this.editingPostId;

    this.postService.updatePost(editingPostId, {
      text: this.createCaption.trim(),
      mediaUrl: this.editingPostMediaUrl ?? undefined,
      hashtags,
      taggedUsers,
    }).pipe(
      finalize(() => {
        this.creatingPost = false;
      }),
    ).subscribe({
      next: () => {
        this.clearCreatePreview();
        this.createSuccessMessage = 'Post updated successfully.';
        void this.router.navigate(['/post', editingPostId]);
      },
      error: (error: { error?: { message?: string } }) => {
        this.createErrorMessage = error?.error?.message ?? 'Unable to update post right now.';
      },
    });
  }

  private exitEditMode(): void {
    this.editMode = false;
    this.editingPostId = null;
    this.editingPostMediaUrl = null;
  }

  private showCreateSuccess(message: string): void {
    this.createSuccessMessage = message;
    if (this.createSuccessTimer) {
      clearTimeout(this.createSuccessTimer);
    }
    this.createSuccessTimer = setTimeout(() => {
      this.createSuccessMessage = '';
      this.createSuccessTimer = null;
    }, 3500);
  }

  goToLogin(): void {
    void this.router.navigate(['/login']);
  }

  goToSignup(): void {
    void this.router.navigate(['/signup'], { queryParams: { mode: 'signup' } });
  }

  private requireAuthenticationForAction(): boolean {
    if (this.isAuthenticated) {
      return true;
    }

    void this.router.navigate(['/login']);
    return false;
  }

  private colorFromText(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
      hash = text.charCodeAt(i) + ((hash << 5) - hash);
    }

    const color = (hash & 0x00ffffff).toString(16).toUpperCase();
    return `#${'000000'.substring(0, 6 - color.length)}${color}`;
  }

  private timeAgo(value: string): string {
    const now = Date.now();
    const created = new Date(value).getTime();
    const diffMinutes = Math.max(1, Math.floor((now - created) / 60000));

    if (diffMinutes < 60) {
      return `${diffMinutes}m ago`;
    }

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }
}
