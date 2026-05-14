import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, EventEmitter, HostListener, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';

import { ImageFallbackDirective } from '../../directives/image-fallback.directive';
import { StoryItem, StoryMediaItem } from '../../models/dashboard-ui.model';
import { AuthService } from '../../services/auth.service';
import { LikedByAccount } from '../../services/liked-by.service';
import { ReactionService } from '../../services/reaction.service';
import { StoryService } from '../../services/story.service';
import { DEFAULT_AVATAR_URL } from '../../utils/avatar.util';
import { LikedByModalComponent } from '../liked-by-modal/liked-by-modal.component';
import { VerifiedBadgeComponent } from '../verified-badge/verified-badge.component';

@Component({
  selector: 'app-story-viewer',
  standalone: true,
  imports: [CommonModule, FormsModule, ImageFallbackDirective, LikedByModalComponent, VerifiedBadgeComponent],
  templateUrl: './story-viewer.component.html',
  styleUrl: './story-viewer.component.css',
})
export class StoryViewerComponent implements OnChanges, OnDestroy {
  @Input() isOpen = false;
  @Input() storyGroups: StoryItem[] = [];
  @Input() startUserId: number | null = null;

  @Output() closed = new EventEmitter<void>();
  @Output() viewed = new EventEmitter<{ storyId: string; userId: number }>();
  @Output() deleted = new EventEmitter<{ storyId: string; userId: number }>();
  @Output() highlightEditRequested = new EventEmitter<number>();
  @Output() highlightDeleteRequested = new EventEmitter<number>();

  @ViewChild('storyVideo') storyVideoRef?: ElementRef<HTMLVideoElement>;

  groupIndex = 0;
  storyIndex = 0;
  progressPercent = 0;
  isPaused = false;
  replyText = '';
  replyFocused = false;
  reactionCount = 0;
  reactedToCurrentStory = false;
  reactionBusy = false;
  reactionErrorMessage = '';
  showActionsMenu = false;
  deleteBusy = false;
  deleteErrorMessage = '';
  viewsModalOpen = false;
  viewsModalLoading = false;
  viewsModalError = '';
  viewedByAccounts: LikedByAccount[] = [];

  private timerId: ReturnType<typeof setInterval> | null = null;
  private currentDurationMs = 5000;
  private readonly viewedStoryIds = new Set<string>();
  private resumeAfterViewsModalClose = false;
  private resumeAfterReplyBlur = false;

  constructor(
    private readonly authService: AuthService,
    private readonly storyService: StoryService,
    private readonly reactionService: ReactionService,
    private readonly router: Router,
  ) {}

  get groups(): StoryItem[] {
    return this.storyGroups.filter((group) => (group.stories?.length ?? 0) > 0);
  }

  get currentGroup(): StoryItem | null {
    return this.groups[this.groupIndex] ?? null;
  }

  get currentStories(): StoryMediaItem[] {
    return this.currentGroup?.stories ?? [];
  }

  get currentStory(): StoryMediaItem | null {
    return this.currentStories[this.storyIndex] ?? null;
  }

  get canDeleteCurrentStory(): boolean {
    const currentUserId = this.authService.getAuthUser()?.id ?? null;
    return currentUserId != null && this.currentGroup?.userId === currentUserId;
  }

  get currentStoryViewCount(): number {
    return this.currentStory?.viewCount ?? 0;
  }

  get currentHighlightId(): number | null {
    const group = this.currentGroup;
    if (!group) {
      return null;
    }

    if (group.highlightId != null) {
      return group.highlightId;
    }

    const id = group.id ?? '';
    if (!id.startsWith('highlight-')) {
      return null;
    }

    const parsed = Number(id.replace('highlight-', ''));
    return Number.isFinite(parsed) ? parsed : null;
  }

  get isHighlightViewerContext(): boolean {
    return this.currentHighlightId != null;
  }

  get replyPlaceholder(): string {
    return `Reply to ${this.currentGroup?.username || this.currentGroup?.name || 'user'}...`;
  }

  get canSendReply(): boolean {
    return this.replyText.trim().length > 0;
  }

  get canReplyToCurrentStory(): boolean {
    return !this.canDeleteCurrentStory;
  }

  get relativeTimeLabel(): string {
    const createdAt = this.currentStory?.createdAt;
    if (!createdAt) {
      return '';
    }
    const parsedDate = new Date(createdAt);
    if (Number.isNaN(parsedDate.getTime())) {
      return '';
    }

    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(parsedDate);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] || changes['storyGroups'] || changes['startUserId']) {
      if (this.isOpen) {
        this.openViewer();
      } else {
        this.stopTimer();
      }
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (!this.isOpen) {
      return;
    }

    this.closeViewer();
  }

  nextStory(): void {
    const group = this.currentGroup;
    if (!group) {
      this.closeViewer();
      return;
    }

    if (this.storyIndex < this.currentStories.length - 1) {
      this.storyIndex += 1;
      this.startCurrentStory();
      return;
    }

    if (this.groupIndex < this.groups.length - 1) {
      this.groupIndex += 1;
      this.storyIndex = 0;
      this.startCurrentStory();
      return;
    }

    this.closeViewer();
  }

  previousStory(): void {
    if (this.storyIndex > 0) {
      this.storyIndex -= 1;
      this.startCurrentStory();
      return;
    }

    if (this.groupIndex > 0) {
      this.groupIndex -= 1;
      this.storyIndex = Math.max(0, this.currentStories.length - 1);
      this.startCurrentStory();
    }
  }

  closeViewer(): void {
    this.stopTimer();
    this.isPaused = false;
    this.resumeAfterViewsModalClose = false;
    this.replyText = '';
    this.replyFocused = false;
    this.reactionBusy = false;
    this.reactionErrorMessage = '';
    this.showActionsMenu = false;
    this.deleteBusy = false;
    this.deleteErrorMessage = '';
    this.closeViewsModal();
    this.closed.emit();
  }

  storyProgress(index: number): number {
    if (index < this.storyIndex) {
      return 100;
    }

    if (index > this.storyIndex) {
      return 0;
    }

    return this.progressPercent;
  }

  ngOnDestroy(): void {
    this.stopTimer();
  }

  onReplyFocus(): void {
    this.replyFocused = true;
    this.resumeAfterReplyBlur = !this.isPaused;
    if (!this.isPaused) {
      this.isPaused = true;
      this.stopTimer();
      this.syncVideoPlayback();
    }
  }

  onReplyBlur(): void {
    this.replyFocused = false;
    if (this.resumeAfterReplyBlur && !this.viewsModalOpen) {
      this.isPaused = false;
      this.startProgressTimer();
      this.syncVideoPlayback();
    }
    this.resumeAfterReplyBlur = false;
  }

  sendReply(): void {
    if (!this.canSendReply) {
      return;
    }

    this.replyText = '';
    this.replyFocused = false;
  }

  openViewsModal(): void {
    const story = this.currentStory;
    if (!story || !this.canDeleteCurrentStory || this.viewsModalLoading) {
      return;
    }

    this.resumeAfterViewsModalClose = !this.isPaused;
    this.isPaused = true;
    this.stopTimer();
    this.syncVideoPlayback();

    this.viewsModalOpen = true;
    this.viewsModalLoading = true;
    this.viewsModalError = '';
    this.viewedByAccounts = [];

    this.storyService.getStoryViewers(story.storyId).subscribe({
      next: (viewers) => {
        if (this.currentStory?.storyId !== story.storyId) {
          this.viewsModalLoading = false;
          this.viewsModalError = 'Story changed. Open views again for the current story.';
          return;
        }

        this.viewedByAccounts = viewers
          .map((viewer) => ({
            userId: viewer.viewerId,
            username: viewer.username ?? `user${viewer.viewerId}`,
            name: viewer.username ?? 'ConnectSphere User',
            profileImageUrl: viewer.profilePic || DEFAULT_AVATAR_URL,
            reactedAt: viewer.viewedAt,
            reactionType: 'LIKE' as const,
          }))
          .sort((left, right) => new Date(right.reactedAt).getTime() - new Date(left.reactedAt).getTime());

        this.viewsModalLoading = false;
      },
      error: (error: HttpErrorResponse) => {
        this.viewedByAccounts = [];
        this.viewsModalLoading = false;
        this.viewsModalError = this.extractViewsError(error);
      },
    });
  }

  closeViewsModal(): void {
    this.viewsModalOpen = false;
    this.viewsModalLoading = false;
    this.viewsModalError = '';
    this.viewedByAccounts = [];

    if (this.resumeAfterViewsModalClose && !this.replyFocused) {
      this.isPaused = false;
      this.startProgressTimer();
      this.syncVideoPlayback();
    }
    this.resumeAfterViewsModalClose = false;
  }

  openViewedUser(username: string): void {
    const normalizedUsername = username.trim().replace('@', '');
    if (!normalizedUsername) {
      return;
    }

    this.closeViewsModal();
    void this.router.navigate(['/profile', normalizedUsername]);
  }

  private openViewer(): void {
    if (this.groups.length === 0) {
      this.closeViewer();
      return;
    }

    const startIndex = this.startUserId == null
      ? 0
      : this.groups.findIndex((group) => group.userId === this.startUserId);

    this.groupIndex = startIndex >= 0 ? startIndex : 0;
    this.storyIndex = 0;
    this.startCurrentStory();
  }

  private startCurrentStory(): void {
    this.stopTimer();
    this.isPaused = false;
    this.replyText = '';
    this.replyFocused = false;
    this.resumeAfterReplyBlur = false;
    this.showActionsMenu = false;
    this.deleteBusy = false;
    this.deleteErrorMessage = '';

    const story = this.currentStory;
    if (!story) {
      this.closeViewer();
      return;
    }

    this.progressPercent = 0;
    this.loadReactionState(story);
    this.markViewed(story);

    this.currentDurationMs = story.mediaType === 'VIDEO' ? 8000 : 5000;
    this.startProgressTimer();
    this.syncVideoPlayback();
  }

  private markViewed(story: StoryMediaItem): void {
    if (this.viewedStoryIds.has(story.storyId)) {
      return;
    }

    this.viewedStoryIds.add(story.storyId);
    this.storyService.markStoryViewed(story.storyId).subscribe({
      next: () => {
        const userId = this.currentGroup?.userId;
        if (userId != null) {
          this.viewed.emit({ storyId: story.storyId, userId });
        }
      },
      error: () => {
        // Keep viewer smooth even if tracking fails.
      },
    });
  }

  private stopTimer(): void {
    if (this.timerId != null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  togglePause(): void {
    if (!this.currentStory) {
      return;
    }

    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      this.stopTimer();
    } else {
      this.startProgressTimer();
    }

    this.syncVideoPlayback();
  }

  private startProgressTimer(): void {
    this.stopTimer();
    if (this.isPaused) {
      return;
    }

    const tickMs = 100;
    const step = (tickMs / this.currentDurationMs) * 100;

    this.timerId = setInterval(() => {
      this.progressPercent = Math.min(100, this.progressPercent + step);
      if (this.progressPercent >= 100) {
        this.nextStory();
      }
    }, tickMs);
  }

  private syncVideoPlayback(): void {
    queueMicrotask(() => {
      const video = this.storyVideoRef?.nativeElement;
      if (!video) {
        return;
      }

      if (this.isPaused) {
        video.pause();
        return;
      }

      void video.play().catch(() => {
        // Keep story viewer usable if autoplay is blocked.
      });
    });
  }

  toggleReaction(): void {
    const story = this.currentStory;
    if (!story || this.reactionBusy || !story.reactionTargetId) {
      return;
    }

    const previousReacted = this.reactedToCurrentStory;
    const previousCount = this.reactionCount;

    this.reactionBusy = true;
    this.reactionErrorMessage = '';
    this.reactedToCurrentStory = !previousReacted;
    this.reactionCount = Math.max(0, previousCount + (this.reactedToCurrentStory ? 1 : -1));

    const request$ = this.reactedToCurrentStory
      ? this.reactionService.addReaction(story.reactionTargetId, 'STORY', 'LIKE')
      : this.reactionService.removeReaction(story.reactionTargetId, 'STORY');

    request$.subscribe({
      next: () => {
        this.reactionBusy = false;
      },
      error: () => {
        this.reactedToCurrentStory = previousReacted;
        this.reactionCount = previousCount;
        this.reactionBusy = false;
        this.reactionErrorMessage = 'Unable to update story reaction right now.';
      },
    });
  }

  private loadReactionState(story: StoryMediaItem): void {
    if (!story.reactionTargetId) {
      this.reactionCount = 0;
      this.reactedToCurrentStory = false;
      this.reactionErrorMessage = '';
      return;
    }

    this.reactionBusy = false;
    this.reactionErrorMessage = '';

    forkJoin({
      summary: this.reactionService.getSummary(story.reactionTargetId, 'STORY'),
      status: this.reactionService.getStatus(story.reactionTargetId, 'STORY'),
    }).subscribe({
      next: ({ summary, status }) => {
        if (this.currentStory?.storyId !== story.storyId) {
          return;
        }

        this.reactionCount = summary.total ?? 0;
        this.reactedToCurrentStory = status.isReacted;
      },
      error: () => {
        if (this.currentStory?.storyId !== story.storyId) {
          return;
        }

        this.reactionCount = 0;
        this.reactedToCurrentStory = false;
      },
    });
  }

  toggleActionsMenu(): void {
    if (!this.canDeleteCurrentStory || this.deleteBusy) {
      return;
    }

    this.showActionsMenu = !this.showActionsMenu;
  }

  deleteCurrentStory(): void {
    const story = this.currentStory;
    const userId = this.currentGroup?.userId;
    if (!story || userId == null || !this.canDeleteCurrentStory || this.deleteBusy) {
      return;
    }

    this.stopTimer();
    this.deleteBusy = true;
    this.deleteErrorMessage = '';

    this.storyService.deleteStory(story.storyId).subscribe({
      next: () => {
        this.deleteBusy = false;
        this.showActionsMenu = false;
        this.deleted.emit({ storyId: story.storyId, userId });
      },
      error: (error: HttpErrorResponse) => {
        this.deleteBusy = false;
        this.startCurrentStory();
        this.deleteErrorMessage = this.extractDeleteError(error);
      },
    });
  }

  editCurrentHighlight(): void {
    const highlightId = this.currentHighlightId;
    if (highlightId == null || !this.canDeleteCurrentStory || this.deleteBusy) {
      return;
    }

    this.showActionsMenu = false;
    this.closeViewer();
    this.highlightEditRequested.emit(highlightId);
  }

  deleteCurrentHighlight(): void {
    const highlightId = this.currentHighlightId;
    if (highlightId == null || !this.canDeleteCurrentStory || this.deleteBusy) {
      return;
    }

    this.showActionsMenu = false;
    this.closeViewer();
    this.highlightDeleteRequested.emit(highlightId);
  }

  private extractDeleteError(error: HttpErrorResponse): string {
    const backendMessage = (error.error?.message as string | undefined)?.trim();
    if (backendMessage) {
      return backendMessage;
    }

    if (error.status === 401 || error.status === 403) {
      return 'Only the story owner can delete this story.';
    }

    if (error.status === 404) {
      return 'Story not found or already deleted.';
    }

    if (error.status === 0) {
      return 'Story service is unreachable.';
    }

    return 'Unable to delete story right now.';
  }

  private extractViewsError(error: HttpErrorResponse): string {
    const backendMessage = (error.error?.message as string | undefined)?.trim();
    if (backendMessage) {
      return backendMessage;
    }

    if (error.status === 401 || error.status === 403) {
      return 'Only the story owner can see story views.';
    }

    if (error.status === 404) {
      return 'Story not found.';
    }

    if (error.status === 0) {
      return 'Story service is unreachable.';
    }

    return 'Unable to load story viewers right now.';
  }
}
