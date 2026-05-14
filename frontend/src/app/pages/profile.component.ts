import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, catchError, forkJoin, map, of, startWith, takeUntil, throwError, timeout } from 'rxjs';

import { HighlightsComponent } from '../components/highlights/highlights.component';
import { PostGridComponent } from '../components/post-grid/post-grid.component';
import { ProfileHeaderComponent } from '../components/profile-header/profile-header.component';
import { ProfileTabsComponent } from '../components/profile-tabs/profile-tabs.component';
import { SidebarComponent } from '../components/sidebar/sidebar.component';
import { StoryViewerComponent } from '../components/story-viewer/story-viewer.component';
import { StoryItem, StoryMediaItem } from '../models/dashboard-ui.model';
import { HighlightItem, ProfilePostItem, ProfileSummary, ProfileTabType } from '../models/profile-ui.model';
import { AuthService, UserProfileResponse } from '../services/auth.service';
import { FollowService } from '../services/follow.service';
import { HighlightDto, HighlightService } from '../services/highlight.service';
import { PageResponse, PostItem, PostService } from '../services/post.service';
import { StoryDto, StoryService } from '../services/story.service';
import { DEFAULT_AVATAR_URL, normalizeProfileImageUrl } from '../utils/avatar.util';

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [CommonModule, FormsModule, SidebarComponent, ProfileHeaderComponent, HighlightsComponent, ProfileTabsComponent, PostGridComponent, StoryViewerComponent],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.css',
})
export class ProfileComponent implements OnInit, OnDestroy {
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;
  @ViewChild('postsSection') postsSection?: ElementRef<HTMLElement>;

  activeSidebarItem = 'Profile';
  notificationCount = 0;
  activeTab: ProfileTabType = 'posts';
  loadingProfile = false;
  loadingContent = false;
  profileLoaded = false;
  followBusy = false;
  isFollowing = false;
  isPending = false;
  isOwnProfile = false;
  followersCount = 0;
  followingCount = 0;
  loggedInFollowingCount = 0;
  profileErrorMessage = '';
  profileLoadAttempted = false;
  contentAccessRestricted = false;
  contentAccessMessage = '';
  selectedCreateFileName = '';
  selectedCreateFilePreviewUrl: string | null = null;
  selectedCreateFileIsVideo = false;
  storyUploadInProgress = false;
  storyUploadErrorMessage = '';
  storyUploadSuccessMessage = '';
  profileStoryGroups: StoryItem[] = [];
  profileStoryViewerOpen = false;
  profileStoryStartUserId: number | null = null;
  activeViewerGroups: StoryItem[] = [];
  activeViewerStartUserId: number | null = null;
  highlightModalOpen = false;
  highlightModalStep: 'name' | 'stories' = 'name';
  highlightName = '';
  highlightErrorMessage = '';
  creatingHighlight = false;
  availableHighlightStories: StoryDto[] = [];
  selectedHighlightStoryIds = new Set<string>();
  editingHighlight = false;
  editHighlightModalOpen = false;
  editHighlightSaving = false;
  editHighlightErrorMessage = '';
  editHighlightTitle = '';
  editHighlightTarget: HighlightItem | null = null;
  editHighlightStories: StoryDto[] = [];
  editHighlightSelectedStoryIds = new Set<string>();
  originalEditHighlightStoryIds = new Set<string>();
  selectedCoverFile: File | null = null;
  selectedCoverPreviewUrl: string | null = null;

  profile: ProfileSummary = {
    userId: 0,
    username: '',
    name: 'ConnectSphere User',
    bio: 'Welcome to ConnectSphere',
    avatarUrl: DEFAULT_AVATAR_URL,
    isPublic: true,
    verified: false,
    postsLabel: '0',
    followersLabel: '0',
    followingLabel: '0',
  };

  highlights: HighlightItem[] = [];

  posts: ProfilePostItem[] = [];

  savedPosts: ProfilePostItem[] = [];
  readonly taggedPosts: ProfilePostItem[] = [];
  private readonly destroy$ = new Subject<void>();
  readonly isAuthenticated: boolean;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly authService: AuthService,
    private readonly followService: FollowService,
    private readonly postService: PostService,
    private readonly storyService: StoryService,
    private readonly highlightService: HighlightService,
  ) {
    this.isAuthenticated = this.authService.isAuthenticated();
  }

  ngOnInit(): void {
    if (this.isAuthenticated) {
      this.authService.getMyProfile().pipe(takeUntil(this.destroy$)).subscribe({
        next: (me) => {
          this.loggedInFollowingCount = me.following ?? 0;
        },
        error: () => {
          this.loggedInFollowingCount = 0;
        },
      });
    }

    this.route.paramMap.pipe(
      startWith(this.route.snapshot.paramMap),
      takeUntil(this.destroy$),
    ).subscribe((params) => {
      const username = (params.get('username') ?? this.route.snapshot.paramMap.get('username') ?? '').trim();
      if (!username && !this.authService.getAuthUser()?.username?.trim()) {
        this.loadingProfile = false;
        this.loadingContent = false;
        this.profileLoaded = false;
        this.profileErrorMessage = 'Profile username is missing.';
        void this.router.navigate(['/dashboard']);
        return;
      }
      this.loadProfileAndPosts(username);
    });
  }

  get visiblePosts(): ProfilePostItem[] {
    if (this.activeTab === 'saved') {
      return this.savedPosts;
    }

    if (this.activeTab === 'tagged') {
      return this.taggedPosts;
    }

    return this.posts;
  }

  get isTaggedTabActive(): boolean {
    return this.activeTab === 'tagged';
  }

  get profileGridEmptyStateIcon(): string {
    return this.isTaggedTabActive ? '◉' : 'O';
  }

  get profileGridEmptyStateTitle(): string {
    if (!this.isTaggedTabActive) {
      return 'Share Photos';
    }

    return this.isOwnProfile ? 'Photos of you' : 'No tagged posts';
  }

  get profileGridEmptyStateDescription(): string {
    if (!this.isTaggedTabActive) {
      return 'When you share photos, they will appear here';
    }

    return this.isOwnProfile
      ? "When people tag you in photos, they'll appear here."
      : `No posts have tagged @${this.profile.username} yet.`;
  }

  get profileGridShowEmptyAction(): boolean {
    if (this.isTaggedTabActive) {
      return false;
    }

    return this.activeTab !== 'saved';
  }

  onSidebarSelection(item: string): void {
    this.activeSidebarItem = item;

    if (item === 'Create') {
      this.onCreatePostRequested();
      return;
    }

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
      this.navigateToOwnProfile();
      return;
    }

    if (item === 'Notifications') {
      this.notificationCount = 0;
      void this.router.navigate(['/settings/notifications']);
      return;
    }
  }

  onTabChange(tab: ProfileTabType): void {
    if (tab === 'saved' && !this.isOwnProfile) {
      this.activeTab = 'posts';
      return;
    }

    this.activeTab = tab;
    if (tab === 'posts') {
      this.scrollToPostsSection();
    }
  }

  onEditProfile(): void {
    if (!this.isOwnProfile || !this.requireAuthenticationForAction()) {
      return;
    }

    void this.router.navigate(['/settings/edit-profile'], {
      queryParams: { from: this.router.url },
    });
  }

  openFollowers(): void {
    if (!this.requireAuthenticationForAction()) {
      return;
    }

    if (!this.profile.userId) {
      return;
    }

    void this.router.navigate(['/followers', this.profile.userId]);
  }

  openFollowing(): void {
    if (!this.requireAuthenticationForAction()) {
      return;
    }

    if (!this.profile.userId) {
      return;
    }

    void this.router.navigate(['/following', this.profile.userId]);
  }

  scrollToPostsSection(): void {
    this.activeTab = 'posts';
    setTimeout(() => {
      this.postsSection?.nativeElement.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }

  onViewProfileStory(): void {
    if (!this.profile.userId || this.profileStoryGroups.length === 0) {
      return;
    }

    this.activeViewerGroups = this.profileStoryGroups;
    this.activeViewerStartUserId = this.profile.userId;
    this.profileStoryViewerOpen = true;
  }

  onCloseProfileStoryViewer(): void {
    this.profileStoryViewerOpen = false;
    this.activeViewerGroups = [];
    this.activeViewerStartUserId = null;
  }

  onStoryViewed(event: { storyId: string; userId: number }): void {
    this.profileStoryGroups = this.profileStoryGroups.map((group) => {
      if (group.userId !== event.userId) {
        return group;
      }

      const stories = (group.stories ?? []).map((story) =>
        story.storyId === event.storyId
          ? { ...story, viewedByCurrentUser: true }
          : story,
      );

      return {
        ...group,
        stories,
        hasUnseen: stories.some((story) => !story.viewedByCurrentUser),
      };
    });
  }

  onStoryDeleted(event: { storyId: string; userId: number }): void {
    this.profileStoryGroups = this.profileStoryGroups
      .map((group) => {
        if (group.userId !== event.userId) {
          return group;
        }

        const stories = (group.stories ?? []).filter((story) => story.storyId !== event.storyId);
        return {
          ...group,
          stories,
          hasUnseen: stories.some((story) => !story.viewedByCurrentUser),
        };
      })
      .filter((group) => (group.stories?.length ?? 0) > 0);

    this.refreshStoryAndHighlightData();

    if (this.profileStoryGroups.length === 0) {
      this.onCloseProfileStoryViewer();
    }
  }

  openNewHighlightModal(): void {
    if (!this.isOwnProfile) {
      return;
    }

    this.highlightModalOpen = true;
    this.highlightModalStep = 'name';
    this.highlightName = '';
    this.highlightErrorMessage = '';
    this.creatingHighlight = false;
    this.availableHighlightStories = [];
    this.selectedHighlightStoryIds = new Set<string>();
  }

  closeNewHighlightModal(): void {
    this.highlightModalOpen = false;
    this.highlightModalStep = 'name';
    this.highlightName = '';
    this.highlightErrorMessage = '';
    this.creatingHighlight = false;
    this.availableHighlightStories = [];
    this.selectedHighlightStoryIds = new Set<string>();
  }

  openEditHighlightModal(item: HighlightItem): void {
    if (!this.isOwnProfile || !this.profile.userId) {
      return;
    }

    this.editHighlightModalOpen = true;
    this.editHighlightSaving = false;
    this.editHighlightErrorMessage = '';
    this.editHighlightTitle = item.label ?? '';
    this.editHighlightTarget = item;
    this.editHighlightStories = [];
    this.selectedCoverFile = null;
    this.clearEditCoverPreview();

    const selectedIds = new Set((item.stories ?? []).map((story) => story.storyId));
    this.editHighlightSelectedStoryIds = selectedIds;
    this.originalEditHighlightStoryIds = new Set(selectedIds);

    forkJoin({
      active: this.storyService.getUserStories(this.profile.userId).pipe(catchError(() => of([] as StoryDto[]))),
      archived: this.storyService.getArchivedStories().pipe(catchError(() => of([] as StoryDto[]))),
    }).subscribe(({ active, archived }) => {
      const ownPool = [...active, ...archived].filter((story) => !story.deleted);
      const existing = (item.stories ?? []).map((story) => ({
        storyId: story.storyId,
        userId: story.userId,
        reactionTargetId: story.reactionTargetId,
        mediaUrl: story.mediaUrl,
        mediaType: story.mediaType,
        caption: story.caption ?? '',
        createdAt: story.createdAt,
        updatedAt: story.createdAt,
        expiresAt: story.expiresAt,
        archived: false,
        deleted: false,
        archivedAt: null,
        deletedAt: null,
        viewCount: story.viewCount ?? 0,
        viewedByCurrentUser: story.viewedByCurrentUser,
      } as StoryDto));

      const dedup = [...existing, ...ownPool].reduce<StoryDto[]>((acc, story) => {
        if (!acc.some((itemStory) => itemStory.storyId === story.storyId)) {
          acc.push(story);
        }
        return acc;
      }, []);

      this.editHighlightStories = dedup.sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
    });
  }

  closeEditHighlightModal(): void {
    this.editHighlightModalOpen = false;
    this.editHighlightSaving = false;
    this.editHighlightErrorMessage = '';
    this.editHighlightTitle = '';
    this.editHighlightTarget = null;
    this.editHighlightStories = [];
    this.editHighlightSelectedStoryIds = new Set<string>();
    this.originalEditHighlightStoryIds = new Set<string>();
    this.selectedCoverFile = null;
    this.clearEditCoverPreview();
  }

  toggleEditHighlightStory(storyId: string): void {
    const next = new Set(this.editHighlightSelectedStoryIds);
    if (next.has(storyId)) {
      next.delete(storyId);
    } else {
      next.add(storyId);
    }
    this.editHighlightSelectedStoryIds = next;
  }

  isEditHighlightStorySelected(storyId: string): boolean {
    return this.editHighlightSelectedStoryIds.has(storyId);
  }

  openCoverFilePicker(input: HTMLInputElement): void {
    input.click();
  }

  onCoverFileSelected(event: Event): void {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0] ?? null;
    target.value = '';
    if (!file) {
      return;
    }

    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type.toLowerCase())) {
      this.editHighlightErrorMessage = 'Unsupported cover image type. Use jpg, jpeg, png or webp.';
      return;
    }

    this.selectedCoverFile = file;
    this.clearEditCoverPreview();
    this.selectedCoverPreviewUrl = URL.createObjectURL(file);
    this.editHighlightErrorMessage = '';
  }

  saveEditedHighlight(): void {
    if (!this.editHighlightTarget) {
      return;
    }
    let storyIds = Array.from(this.editHighlightSelectedStoryIds);
    if (!this.editHighlightTitle.trim()) {
      this.editHighlightErrorMessage = 'Highlight title is required.';
      return;
    }

    if (storyIds.length === 0 && this.originalEditHighlightStoryIds.size > 0) {
      storyIds = Array.from(this.originalEditHighlightStoryIds);
    }

    if (storyIds.length === 0) {
      this.editHighlightErrorMessage = 'Select at least one story.';
      return;
    }

    this.editHighlightSaving = true;
    this.editHighlightErrorMessage = '';

    const highlightId = this.editHighlightTarget.id;
    const title$ = this.highlightService.updateHighlight(highlightId, this.editHighlightTitle);
    const originalIds = Array.from(this.originalEditHighlightStoryIds);
    const storiesChanged = storyIds.length !== originalIds.length
      || storyIds.some((id) => !this.originalEditHighlightStoryIds.has(id));
    const stories$ = storiesChanged
      ? this.highlightService.updateHighlightStories(highlightId, storyIds)
      : of(null);
    const cover$ = this.selectedCoverFile
      ? this.highlightService.updateCustomCover(highlightId, this.selectedCoverFile)
      : of(null);

    forkJoin([title$, stories$, cover$]).subscribe({
      next: () => {
        this.editHighlightSaving = false;
        this.closeEditHighlightModal();
        this.refreshHighlightsOnly();
      },
      error: (error: HttpErrorResponse) => {
        this.editHighlightSaving = false;
        this.editHighlightErrorMessage = this.extractHighlightError(error);
      },
    });
  }

  onDeleteHighlight(item: HighlightItem): void {
    if (!this.isOwnProfile || item.isNew) {
      return;
    }
    const confirmed = window.confirm(`Delete highlight \"${item.label}\"?`);
    if (!confirmed) {
      return;
    }
    this.highlightService.deleteHighlight(item.id).subscribe({
      next: () => this.refreshHighlightsOnly(),
      error: (error: HttpErrorResponse) => {
        this.profileErrorMessage = this.extractHighlightError(error);
      },
    });
  }

  proceedToHighlightStories(): void {
    if (!this.profile.userId) {
      return;
    }

    if (!this.highlightName.trim()) {
      this.highlightErrorMessage = 'Highlight name is required.';
      return;
    }

    this.highlightErrorMessage = '';
    forkJoin({
      active: this.storyService.getUserStories(this.profile.userId).pipe(catchError(() => of([] as StoryDto[]))),
      archived: this.storyService.getArchivedStories().pipe(catchError(() => of([] as StoryDto[]))),
    }).subscribe({
      next: ({ active, archived }) => {
        const stories = [...active, ...archived]
          .filter((story) => !story.deleted)
          .reduce<StoryDto[]>((acc, story) => {
            if (!acc.some((item) => item.storyId === story.storyId)) {
              acc.push(story);
            }
            return acc;
          }, [])
          .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());

        this.availableHighlightStories = stories;
        this.highlightModalStep = 'stories';
      },
      error: () => {
        this.highlightErrorMessage = 'Unable to load stories for highlight selection.';
      },
    });
  }

  toggleHighlightStorySelection(storyId: string): void {
    const next = new Set(this.selectedHighlightStoryIds);
    if (next.has(storyId)) {
      next.delete(storyId);
    } else {
      next.add(storyId);
    }
    this.selectedHighlightStoryIds = next;
  }

  isHighlightStorySelected(storyId: string): boolean {
    return this.selectedHighlightStoryIds.has(storyId);
  }

  createHighlight(): void {
    const storyIds = Array.from(this.selectedHighlightStoryIds);
    if (!this.highlightName.trim()) {
      this.highlightErrorMessage = 'Highlight name is required.';
      return;
    }

    if (storyIds.length === 0) {
      this.highlightErrorMessage = 'Select at least one story.';
      return;
    }

    this.creatingHighlight = true;
    this.highlightErrorMessage = '';
    this.highlightService.createHighlight(this.highlightName, storyIds).subscribe({
      next: () => {
        this.creatingHighlight = false;
        this.closeNewHighlightModal();
        this.refreshHighlightsOnly();
      },
      error: (error: HttpErrorResponse) => {
        this.creatingHighlight = false;
        this.highlightErrorMessage = this.extractHighlightError(error);
      },
    });
  }

  onHighlightSelected(item: HighlightItem): void {
    if (!item.stories?.length || !this.profile.userId) {
      return;
    }

    this.activeViewerGroups = [{
      id: `highlight-${item.id}`,
      highlightId: item.id,
      userId: this.profile.userId,
      name: this.profile.name || this.profile.username,
      username: this.profile.username,
      avatarColor: '#4f7bff',
      avatarUrl: this.profile.avatarUrl,
      hasUnseen: item.stories.some((story) => !story.viewedByCurrentUser),
      stories: item.stories,
    }];
    this.activeViewerStartUserId = this.profile.userId;
    this.profileStoryViewerOpen = true;
  }

  onViewerHighlightEditRequested(highlightId: number): void {
    const target = this.highlights.find((item) => item.id === highlightId && !item.isNew);
    if (!target) {
      return;
    }
    this.openEditHighlightModal(target);
  }

  onViewerHighlightDeleteRequested(highlightId: number): void {
    const target = this.highlights.find((item) => item.id === highlightId && !item.isNew);
    if (!target) {
      return;
    }
    this.onDeleteHighlight(target);
  }

  onToggleFollow(): void {
    if (this.isOwnProfile || this.followBusy || !this.profile.userId || !this.requireAuthenticationForAction()) {
      return;
    }

    this.followBusy = true;
    const request$ = this.isFollowing || this.isPending
      ? this.followService.unfollowUser(this.profile.userId)
      : this.followService.followUser(this.profile.userId);

    request$.subscribe({
      next: () => {
        this.reloadRelationshipState();
      },
      error: () => {
        this.followBusy = false;
      },
    });
  }

  onCreateFileSelected(file: File): void {
    if (this.selectedCreateFilePreviewUrl) {
      URL.revokeObjectURL(this.selectedCreateFilePreviewUrl);
    }

    this.selectedCreateFileName = file.name;
    this.selectedCreateFileIsVideo = file.type.startsWith('video/');
    this.selectedCreateFilePreviewUrl = URL.createObjectURL(file);
    this.storyUploadErrorMessage = '';
    this.storyUploadSuccessMessage = '';
  }

  onCreatePostRequested(): void {
    if (!this.requireAuthenticationForAction()) {
      return;
    }

    void this.router.navigate(['/dashboard'], {
      queryParams: { createPost: 1 },
    });
  }

  openFilePicker(): void {
    if (!this.requireAuthenticationForAction()) {
      return;
    }

    this.storyUploadErrorMessage = '';
    this.storyUploadSuccessMessage = '';
    this.fileInput?.nativeElement.click();
  }

  onFileSelected(event: Event): void {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) {
      return;
    }

    this.onCreateFileSelected(file);
    this.uploadStory(file);
    target.value = '';
  }

  uploadStory(file: File): void {
    const isSupported = file.type.startsWith('image/') || file.type.startsWith('video/');
    if (!isSupported) {
      this.storyUploadErrorMessage = 'Please choose an image or video file.';
      return;
    }

    const maxSizeBytes = 10 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      this.storyUploadErrorMessage = 'File size must be less than 10MB.';
      return;
    }

    if (!this.profile.userId) {
      this.storyUploadErrorMessage = 'Unable to identify current profile for story upload.';
      return;
    }

    this.storyUploadInProgress = true;
    this.storyUploadErrorMessage = '';
    this.storyUploadSuccessMessage = '';

    this.storyService.createStory(file).subscribe({
      next: () => {
        this.storyUploadInProgress = false;
        this.storyUploadSuccessMessage = 'Story uploaded successfully.';
        this.refreshStoryAndHighlightData();
      },
      error: (error: HttpErrorResponse) => {
        this.storyUploadInProgress = false;
        this.storyUploadErrorMessage = this.extractStoryUploadError(error);
      },
    });
  }

  clearCreatePreview(): void {
    if (this.selectedCreateFilePreviewUrl) {
      URL.revokeObjectURL(this.selectedCreateFilePreviewUrl);
    }

    this.selectedCreateFileName = '';
    this.selectedCreateFilePreviewUrl = null;
    this.selectedCreateFileIsVideo = false;
    this.storyUploadErrorMessage = '';
    this.storyUploadSuccessMessage = '';
  }

  ngOnDestroy(): void {
    if (this.selectedCreateFilePreviewUrl) {
      URL.revokeObjectURL(this.selectedCreateFilePreviewUrl);
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  private clearEditCoverPreview(): void {
    if (this.selectedCoverPreviewUrl) {
      URL.revokeObjectURL(this.selectedCoverPreviewUrl);
    }
    this.selectedCoverPreviewUrl = null;
  }

  private loadProfileAndPosts(viewUsername: string | null): void {
    this.profileLoadAttempted = true;
    this.loadingProfile = true;
    this.loadingContent = true;
    this.profileLoaded = false;
    this.profileErrorMessage = '';
    this.contentAccessRestricted = false;
    this.contentAccessMessage = '';

    const normalized = viewUsername?.trim() || this.authService.getAuthUser()?.username?.trim() || '';
    if (!normalized) {
      const authUser = this.authService.getAuthUser();
      if (authUser?.username?.trim()) {
        void this.router.navigate(['/profile', authUser.username.trim()]);
        return;
      }
      this.loadingProfile = false;
      this.loadingContent = false;
      this.profileErrorMessage = 'Unable to resolve profile username.';
      return;
    }

    const authUser = this.authService.getAuthUser();
    const fallbackName = authUser
      ? `${authUser.firstName ?? ''} ${authUser.lastName ?? ''}`.trim() || normalized
      : normalized;
    this.profile = {
      ...this.profile,
      username: normalized,
      verified: !!authUser?.verified,
      name: this.profile.name && this.profile.name !== 'ConnectSphere User'
        ? this.profile.name
        : fallbackName,
      bio: this.profile.bio || authUser?.bio || '',
      avatarUrl: normalizeProfileImageUrl(authUser?.profileImageUrl || this.profile.avatarUrl),
      isPublic: this.profile.isPublic ?? true,
    };

    if (authUser?.username?.toLowerCase() === normalized.toLowerCase()) {
      this.profile = {
        ...this.profile,
        username: authUser.username,
        name: fallbackName || authUser.username,
        verified: !!authUser.verified,
      };
    }

    // Always render a stable profile shell first, then hydrate with API response.
    this.profileLoaded = true;
    this.loadUserProfile(normalized);
  }

  private loadUserProfile(username: string): void {
    this.authService.getUserByUsername(username).pipe(
      timeout(9000),
      catchError((error: HttpErrorResponse) => {
        const authUser = this.authService.getAuthUser();
        const isOwn = !!authUser?.username && authUser.username.toLowerCase() === username.toLowerCase();
        if (!isOwn) {
          return throwError(() => error);
        }

        return this.authService.getMyProfile().pipe(
          timeout(5000),
          map((me) => ({
            userId: authUser?.id ?? 0,
            username: me.username || authUser?.username || username,
            name: me.name || `${authUser?.firstName ?? ''} ${authUser?.lastName ?? ''}`.trim() || username,
            bio: me.bio || authUser?.bio || '',
            profileImageUrl: me.profileImageUrl || authUser?.profileImageUrl || '',
            isPublic: me.isPublic ?? true,
            verified: (me.verified ?? false) || !!authUser?.verified,
            postCount: me.postCount ?? 0,
            followers: me.followers ?? 0,
            following: me.following ?? 0,
          }) as UserProfileResponse),
          catchError(() => of({
            userId: authUser?.id ?? 0,
            username: authUser?.username || username,
            name: `${authUser?.firstName ?? ''} ${authUser?.lastName ?? ''}`.trim() || username,
            bio: authUser?.bio || '',
            profileImageUrl: authUser?.profileImageUrl || '',
            isPublic: true,
            verified: !!authUser?.verified,
            postCount: 0,
            followers: 0,
            following: 0,
          } as UserProfileResponse)),
        );
      }),
    ).subscribe({
      next: (profileResponse) => {
        const authUser = this.authService.getAuthUser();
        const fallbackUsername = authUser?.username?.trim() || username.trim();
        if (!fallbackUsername) {
          this.loadingProfile = false;
          this.loadingContent = false;
          this.profileErrorMessage = 'Unable to resolve profile username.';
          void this.router.navigate(['/dashboard']);
          return;
        }

        if (!profileResponse) {
          profileResponse = {
            userId: authUser?.id ?? 0,
            username: fallbackUsername,
            name: `${authUser?.firstName ?? ''} ${authUser?.lastName ?? ''}`.trim() || fallbackUsername,
            bio: authUser?.bio || '',
            profileImageUrl: authUser?.profileImageUrl || '',
            isPublic: true,
            verified: !!authUser?.verified,
            postCount: 0,
            followers: 0,
            following: 0,
          };
        }

        if (!profileResponse?.username?.trim()) {
          if (authUser?.username?.trim()) {
            profileResponse = {
              ...profileResponse,
              username: authUser.username.trim(),
              verified: (profileResponse?.verified ?? false) || !!authUser.verified,
            };
          } else {
            profileResponse = {
              ...profileResponse,
              username: fallbackUsername,
            };
          }
        }
        this.applyProfile(profileResponse);
        this.profileLoaded = true;
        this.loadingProfile = false;
        this.loadPostsAndFollowData(profileResponse.username, profileResponse.userId);
      },
      error: (error: HttpErrorResponse) => {
        const authUser = this.authService.getAuthUser();
        if (authUser?.username?.trim() && authUser.username.toLowerCase() === username.toLowerCase()) {
          this.profile = {
            ...this.profile,
            username: authUser.username.trim(),
            name: `${authUser.firstName ?? ''} ${authUser.lastName ?? ''}`.trim() || authUser.username.trim(),
            verified: !!authUser.verified,
          };
          this.profileLoaded = true;
          this.loadingProfile = false;
          this.loadPostsAndFollowData(authUser.username.trim(), authUser.id);
          return;
        }
        // Fail open for non-own profiles: keep route username visible and continue loading posts.
        // This avoids blank/crashing profile UX when auth-service is temporarily unavailable.
        this.applyProfile({
          userId: 0,
          username: username.trim() || this.profile.username || 'connectsphere_user',
          name: this.profile.name || username.trim() || 'ConnectSphere User',
          bio: this.profile.bio || '',
          profileImageUrl: this.profile.avatarUrl || '',
          isPublic: true,
          verified: false,
          postCount: 0,
          followers: this.followersCount,
          following: this.followingCount,
        });
        this.profileLoaded = true;
        this.loadingProfile = false;
        this.profileErrorMessage = this.extractErrorMessage(error);
        this.loadPostsAndFollowData(username, 0);
      },
    });
  }

  private loadPostsAndFollowData(username: string, userId: number): void {
    const hasValidTargetUser = userId > 0;
    const status$ = this.isOwnProfile || !hasValidTargetUser
      ? of({ isFollowing: false, isPending: false, canViewContent: true, targetPublic: true })
      : this.followService.getStatus(userId).pipe(catchError(() => of({
          isFollowing: false,
          isPending: false,
          canViewContent: false,
          targetPublic: this.profile.isPublic,
        })), timeout(7000));

    forkJoin({
      postCount: this.postService.getPostCountByUsername(username).pipe(
        timeout(7000),
        catchError(() => of(0)),
      ),
      posts: this.isAuthenticated
        ? this.postService.getPostsByUsernamePage(username).pipe(
            timeout(7000),
            map((page) => ({
              ...page,
              accessDenied: false,
            })),
            catchError((error: HttpErrorResponse) => {
              if (error.status === 403) {
                return of({
                  content: [],
                  totalElements: 0,
                  totalPages: 0,
                  size: 0,
                  number: 0,
                  first: true,
                  last: true,
                  accessDenied: true,
                } as PageResponse<PostItem> & { accessDenied: boolean });
              }

              return of({
                content: [],
                totalElements: 0,
                totalPages: 0,
                size: 0,
                number: 0,
                first: true,
                last: true,
                accessDenied: false,
              } as PageResponse<PostItem> & { accessDenied: boolean });
            }),
          )
        : this.postService.getPublicPostsByUsername(username).pipe(
            timeout(7000),
            map((posts) => ({
              content: posts,
              totalElements: posts.length,
              totalPages: 1,
              size: posts.length,
              number: 0,
              first: true,
              last: true,
              accessDenied: false,
            } as PageResponse<PostItem> & { accessDenied: boolean })),
            catchError(() => of({
              content: [] as PostItem[],
              totalElements: 0,
              totalPages: 0,
              size: 0,
              number: 0,
              first: true,
              last: true,
              accessDenied: false,
            } as PageResponse<PostItem> & { accessDenied: boolean })),
          ),
      savedPosts: this.isOwnProfile
        ? this.postService.getSavedPosts().pipe(
            timeout(7000),
            catchError(() => of({
              content: [] as PostItem[],
              totalElements: 0,
              totalPages: 0,
              size: 0,
              number: 0,
              first: true,
              last: true,
            })),
          )
        : of({
            content: [] as PostItem[],
            totalElements: 0,
            totalPages: 0,
            size: 0,
            number: 0,
            first: true,
            last: true,
          }),
        taggedPosts: this.postService.getTaggedPostsByUsernamePage(username).pipe(
          timeout(7000),
          catchError(() => of({
            content: [] as PostItem[],
            totalElements: 0,
            totalPages: 0,
            size: 0,
            number: 0,
            first: true,
            last: true,
          })),
        ),
      counts: hasValidTargetUser ? this.followService.getCounts(userId).pipe(
        timeout(7000),
        catchError(() =>
          of({
            followers: this.followersCount,
            following: this.followingCount,
          }),
        ),
      ) : of({
        followers: this.followersCount,
        following: this.followingCount,
      }),
      status: status$,
      stories: this.storyService.getUserStories(userId).pipe(
        timeout(7000),
        catchError((error: HttpErrorResponse) => {
          if (error.status === 403) {
            return of({ items: [] as StoryDto[], accessDenied: true });
          }
          return of({ items: [] as StoryDto[], accessDenied: false });
        }),
        map((value) => Array.isArray(value) ? { items: value, accessDenied: false } : value),
        ),
      }).subscribe({
        next: ({ postCount, posts, savedPosts, taggedPosts, counts, status, stories }) => {
        this.posts = posts.content.map((post) => this.toProfilePost(post));
        this.savedPosts = savedPosts.content.map((post) => this.toProfilePost(post));
        this.taggedPosts.length = 0;
        this.taggedPosts.push(...taggedPosts.content.map((post) => this.toProfilePost(post)));

        this.followersCount = counts.followers;
        this.followingCount = counts.following;
        this.profile = {
          ...this.profile,
          postsLabel: String(Math.max(0, postCount)),
        };
        this.isFollowing = status.isFollowing;
        this.isPending = status.isPending;
        this.contentAccessRestricted = Boolean(posts.accessDenied || stories.accessDenied || (!status.canViewContent && !this.isOwnProfile));
        this.contentAccessMessage = this.isPending
          ? 'Follow request pending. You will be able to view posts and stories after approval.'
          : 'This account is private. Follow and get approved to view posts and stories.';
        this.syncProfileCounts();

        this.profileStoryGroups = this.toStoryGroups(stories.items);
        this.loadHighlights(userId);

        this.loadingContent = false;
      },
      error: () => {
        this.profileStoryGroups = [];
        this.highlights = this.baseHighlightItems([]);
        this.posts = [];
        this.savedPosts = [];
        this.profileLoaded = true;
        this.loadingContent = false;
      },
    });
  }

  private refreshStoryAndHighlightData(): void {
    if (!this.profile.userId) {
      return;
    }

    forkJoin({
      stories: this.storyService.getUserStories(this.profile.userId).pipe(catchError(() => of([] as StoryDto[]))),
      highlights: this.highlightService.getUserHighlights(this.profile.userId).pipe(catchError(() => of([] as HighlightDto[]))),
    }).subscribe(({ stories, highlights }) => {
      this.profileStoryGroups = this.toStoryGroups(stories);
      this.highlights = this.toHighlightsFromDtos(highlights);
    });
  }

  private refreshHighlightsOnly(): void {
    if (!this.profile.userId) {
      return;
    }

    this.loadHighlights(this.profile.userId);
  }

  private loadHighlights(userId: number): void {
    this.highlightService.getUserHighlights(userId).pipe(
      catchError(() => of([] as HighlightDto[])),
    ).subscribe((highlights) => {
      this.highlights = this.toHighlightsFromDtos(highlights);
    });
  }

  private toHighlightsFromDtos(highlights: HighlightDto[]): HighlightItem[] {
    const mapped = highlights.map((highlight) => ({
      id: highlight.id,
      label: highlight.name,
      imageUrl: highlight.coverMediaUrl,
      stories: highlight.stories.map((story) => this.toStoryMediaItem(story)),
    }));

    return this.baseHighlightItems(mapped);
  }

  private baseHighlightItems(items: HighlightItem[]): HighlightItem[] {
    if (!this.isOwnProfile) {
      return items;
    }

    return [{ id: 1, label: 'New', imageUrl: '', isNew: true }, ...items];
  }

  private toStoryMediaItem(story: StoryDto): StoryMediaItem {
    return {
      storyId: story.storyId,
      userId: story.userId,
      reactionTargetId: story.reactionTargetId,
      mediaUrl: story.mediaUrl,
      mediaType: story.mediaType,
      caption: story.caption,
      createdAt: story.createdAt,
      expiresAt: story.expiresAt,
      viewCount: story.viewCount,
      viewedByCurrentUser: story.viewedByCurrentUser,
    };
  }

  private toStoryGroups(stories: StoryDto[]): StoryItem[] {
    if (!this.profile.userId || stories.length === 0) {
      return [];
    }

    const mappedStories: StoryMediaItem[] = stories.map((story) => ({
      storyId: story.storyId,
      userId: story.userId,
      reactionTargetId: story.reactionTargetId,
      mediaUrl: story.mediaUrl,
      mediaType: story.mediaType,
      caption: story.caption,
      createdAt: story.createdAt,
      expiresAt: story.expiresAt,
      viewCount: story.viewCount,
      viewedByCurrentUser: story.viewedByCurrentUser,
    }));

    return [{
      id: `profile-story-${this.profile.userId}`,
      userId: this.profile.userId,
      name: this.profile.name || this.profile.username,
      username: this.profile.username,
      avatarColor: '#4f7bff',
      avatarUrl: this.profile.avatarUrl,
      hasUnseen: mappedStories.some((story) => !story.viewedByCurrentUser),
      stories: mappedStories,
    }];
  }

  private applyProfile(profile: UserProfileResponse): void {
    const authUser = this.authService.getAuthUser();
    const safeUsername = profile?.username?.trim() || authUser?.username?.trim() || this.profile.username || '';
    const currentUsername = authUser?.username?.toLowerCase() ?? '';
    this.isOwnProfile = !!safeUsername && currentUsername === safeUsername.toLowerCase();
    if (!this.isOwnProfile && this.activeTab === 'saved') {
      this.activeTab = 'posts';
    }

    this.followersCount = profile.followers ?? 0;
    this.followingCount = profile.following ?? 0;

    const effectiveVerified = this.isOwnProfile
      ? (profile.verified ?? false) || !!authUser?.verified
      : (profile.verified ?? false);

    this.profile = {
      userId: profile.userId,
      username: safeUsername,
      name: profile.name || safeUsername,
      bio: profile.bio || '',
      isPublic: profile.isPublic ?? true,
      verified: effectiveVerified,
      avatarUrl: normalizeProfileImageUrl(profile.profileImageUrl),
      postsLabel: String(Math.max(0, profile.postCount ?? 0)),
      followersLabel: String(this.followersCount),
      followingLabel: String(this.followingCount),
    };

    if (this.isOwnProfile && authUser && authUser.verified !== effectiveVerified) {
      this.authService.persistAuthUser({ ...authUser, verified: effectiveVerified });
    }
    this.posts = [];
    this.savedPosts = [];
    this.profileErrorMessage = '';
    this.isPending = false;
  }

  private syncProfileCounts(): void {
    this.profile = {
      ...this.profile,
      followersLabel: String(Math.max(0, this.followersCount)),
      followingLabel: String(Math.max(0, this.followingCount)),
    };
  }

  private extractErrorMessage(error: HttpErrorResponse): string {
    if ((error.status === 401 || error.status === 403) && this.isAuthenticated) {
      this.authService.clearSession();
      void this.router.navigate(['/auth']);
      return 'Session expired. Please sign in again.';
    }

    const backendMessage = error.error?.message as string | undefined;
    if (backendMessage && backendMessage.trim()) {
      return backendMessage;
    }

    if (error.status === 0) {
      return 'Service is unreachable. Ensure auth-service and api-gateway are running.';
    }

    return 'Unable to load your profile right now. Please refresh the page.';
  }

  private extractStoryUploadError(error: HttpErrorResponse): string {
    const backendMessage = (error.error?.message as string | undefined)?.trim();
    if (backendMessage) {
      return backendMessage;
    }

    if (error.status === 401 || error.status === 403) {
      return 'Session expired. Please sign in again.';
    }

    if (error.status === 413) {
      return 'File is too large for upload.';
    }

    if (error.status === 415) {
      return 'Unsupported file type. Use image or video files.';
    }

    if (error.status === 0) {
      return 'Story service is unreachable. Check api-gateway and story-service.';
    }

    return 'Upload failed. Please try again.';
  }

  private extractHighlightError(error: HttpErrorResponse): string {
    const backendMessage = (error.error?.message as string | undefined)?.trim();
    if (backendMessage) {
      return backendMessage;
    }

    if (error.status === 401 || error.status === 403) {
      return 'You are not allowed to create this highlight.';
    }

    if (error.status === 0) {
      return 'Highlight service is unreachable.';
    }

    return 'Unable to create highlight right now.';
  }

  private postMediaType(mediaUrl: string | null): 'image' | 'video' | 'none' {
    if (!mediaUrl || !mediaUrl.trim()) {
      return 'none';
    }

    const normalized = mediaUrl.toLowerCase();
    if (normalized.endsWith('.mp4') || normalized.includes('/video/')) {
      return 'video';
    }

    return 'image';
  }

  private toProfilePost(post: PostItem): ProfilePostItem {
    return {
      id: post.id,
      authorId: post.authorId,
      text: post.text ?? '',
      mediaUrl: post.mediaUrl ?? '',
      mediaType: this.postMediaType(post.mediaUrl),
      taggedUsers: post.taggedUsers ?? [],
      likes: post.likesCount ?? 0,
      isLiked: false,
      isSaved: post.saved ?? false,
      likeInFlight: false,
      comments: post.commentsCount ?? 0,
    };
  }

  private navigateToOwnProfile(): void {
    const username = this.authService.getAuthUser()?.username?.trim();
    if (!username) {
      void this.router.navigate(['/login']);
      return;
    }

    void this.router.navigate(['/profile', username.toLowerCase()]);
  }

  private requireAuthenticationForAction(): boolean {
    if (this.isAuthenticated) {
      return true;
    }

    void this.router.navigate(['/login']);
    return false;
  }

  private reloadRelationshipState(): void {
    if (!this.profile.userId) {
      this.followBusy = false;
      return;
    }

    forkJoin({
      counts: this.followService.getFollowCounts(this.profile.userId).pipe(
        catchError(() => of({
          followers: this.followersCount,
          following: this.followingCount,
        })),
      ),
      status: this.followService.getFollowStatus(this.profile.userId).pipe(
        catchError(() => of({
          isFollowing: false,
          isPending: false,
          canViewContent: this.profile.isPublic,
          targetPublic: this.profile.isPublic,
        })),
      ),
      posts: this.postService.getPostsByUsernamePage(this.profile.username).pipe(
        catchError(() => of({
          content: [] as PostItem[],
          totalElements: 0,
          totalPages: 0,
          size: 0,
          number: 0,
          first: true,
          last: true,
        })),
      ),
      savedPosts: this.isOwnProfile
        ? this.postService.getSavedPosts().pipe(
            catchError(() => of({
              content: [] as PostItem[],
              totalElements: 0,
              totalPages: 0,
              size: 0,
              number: 0,
              first: true,
              last: true,
            })),
          )
        : of({
            content: [] as PostItem[],
            totalElements: 0,
            totalPages: 0,
            size: 0,
            number: 0,
            first: true,
            last: true,
          }),
      stories: this.storyService.getUserStories(this.profile.userId).pipe(
        catchError(() => of([] as StoryDto[])),
      ),
    }).subscribe({
      next: ({ counts, status, posts, savedPosts, stories }) => {
        this.followersCount = counts.followers;
        this.followingCount = counts.following;
        this.isFollowing = status.isFollowing;
        this.isPending = status.isPending;
        this.contentAccessRestricted = !status.canViewContent && !this.isOwnProfile;
        this.contentAccessMessage = this.isPending
          ? 'Follow request pending. You will be able to view posts and stories after approval.'
          : 'This account is private. Follow and get approved to view posts and stories.';
        this.posts = posts.content.map((post) => this.toProfilePost(post));
        this.savedPosts = savedPosts.content.map((post) => this.toProfilePost(post));
        this.profileStoryGroups = this.toStoryGroups(stories);
        this.loadHighlights(this.profile.userId);
        this.syncProfileCounts();
        this.followBusy = false;
      },
      error: () => {
        this.followBusy = false;
      },
    });
  }
}
