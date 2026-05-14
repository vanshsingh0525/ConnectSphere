import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';

import { ImageFallbackDirective } from '../../directives/image-fallback.directive';
import { FeedPostItem } from '../../models/dashboard-ui.model';
import { LikedByModalComponent } from '../liked-by-modal/liked-by-modal.component';
import { CommentService } from '../../services/comment.service';
import { LikedByAccount, LikedByService } from '../../services/liked-by.service';
import { ReactionService } from '../../services/reaction.service';
import { parsePostEntityText, PostEntityTextToken } from '../../utils/post-entity-text.util';
import { AuthService } from '../../services/auth.service';
import { VerifiedBadgeComponent } from '../verified-badge/verified-badge.component';

@Component({
  selector: 'app-post-card',
  standalone: true,
  imports: [CommonModule, ImageFallbackDirective, LikedByModalComponent, VerifiedBadgeComponent],
  templateUrl: './post-card.component.html',
  styleUrl: './post-card.component.css',
})
export class PostCardComponent implements OnChanges {
  @Input({ required: true }) post!: FeedPostItem;
  @Output() userSelected = new EventEmitter<string>();
  @Output() editRequested = new EventEmitter<number>();

  likeInFlight = false;
  likesModalOpen = false;
  likesModalLoading = false;
  likesModalError = '';
  likedByAccounts: LikedByAccount[] = [];
  postMenuOpen = false;
  private engagementRefreshInFlight = false;
  private readonly currentUserId: number | null;

  constructor(
    private readonly commentService: CommentService,
    private readonly reactionService: ReactionService,
    private readonly likedByService: LikedByService,
    private readonly authService: AuthService,
    private readonly router: Router,
  ) {
    this.currentUserId = this.authService.getAuthUser()?.id ?? null;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['post'] || !this.post?.id) {
      return;
    }

    // Ensure UI-facing fields have safe defaults so newly created posts render actions
    this.post.likes = (this.post.likes ?? 0) as number;
    this.post.comments = (this.post.comments ?? 0) as number;
    this.post.shares = (this.post.shares ?? 0) as number;
    this.post.isLiked = this.post.isLiked ?? false;
    this.post.isSaved = this.post.isSaved ?? false;

    this.refreshEngagementState();
  }

  toggleLike(): void {
    if (this.likeInFlight) {
      return;
    }

    const wasLiked = !!this.post.isLiked;
    this.post.isLiked = !wasLiked;
    this.post.likes = Math.max(0, this.post.likes + (wasLiked ? -1 : 1));

    this.likeInFlight = true;
    const request$ = wasLiked
      ? this.reactionService.removeReaction(this.post.id, 'POST')
      : this.reactionService.addReaction(this.post.id, 'POST', 'LIKE');

    request$.subscribe({
      next: () => {
        this.likeInFlight = false;
        this.refreshEngagementState();
      },
      error: () => {
        this.post.isLiked = wasLiked;
        this.post.likes = Math.max(0, this.post.likes + (wasLiked ? 1 : -1));
        this.likeInFlight = false;
      },
    });
  }

  incrementComment(): void {
    void this.router.navigate(['/post', this.post.id], {
      queryParams: { from: this.router.url },
    });
  }

  incrementShare(): void {
    this.post.shares += 1;
  }

  openProfile(username?: string): void {
    const normalized = (username ?? this.post.userHandle).replace('@', '').trim().toLowerCase();
    if (normalized) {
      this.userSelected.emit(normalized);
    }
  }

  openPost(): void {
    void this.router.navigate(['/post', this.post.id], {
      queryParams: { from: this.router.url },
    });
  }

  togglePostMenu(event?: Event): void {
    event?.stopPropagation();
    this.postMenuOpen = !this.postMenuOpen;
  }

  closePostMenu(): void {
    this.postMenuOpen = false;
  }

  canEditPost(): boolean {
    return this.currentUserId != null && this.currentUserId === this.post.authorId;
  }

  requestEditPost(event?: Event): void {
    event?.stopPropagation();
    this.postMenuOpen = false;
    if (!this.canEditPost()) {
      return;
    }

    this.editRequested.emit(this.post.id);
  }

  openHashtag(tag: string, event?: Event): void {
    event?.stopPropagation();
    const normalized = tag.trim().replace(/^#/, '');
    if (!normalized) {
      return;
    }

    void this.router.navigate(['/hashtag', normalized]);
  }

  openLikesModal(event?: Event): void {
    event?.stopPropagation();

    this.likesModalOpen = true;
    this.likesModalLoading = true;
    this.likesModalError = '';

    this.likedByService.getAccounts(this.post.id, 'POST', 'LIKE').subscribe({
      next: (accounts) => {
        this.likedByAccounts = accounts;
        this.likesModalLoading = false;
      },
      error: () => {
        this.likedByAccounts = [];
        this.likesModalLoading = false;
        this.likesModalError = 'Unable to load likes right now.';
      },
    });
  }

  closeLikesModal(): void {
    this.likesModalOpen = false;
    this.likesModalLoading = false;
    this.likesModalError = '';
  }

  openLikedUser(username: string): void {
    this.closeLikesModal();
    this.userSelected.emit(username);
  }

  contentTokens(): PostEntityTextToken[] {
    return parsePostEntityText(this.post?.content ?? '');
  }

  private refreshEngagementState(): void {
    if (this.engagementRefreshInFlight || !this.post?.id) {
      return;
    }

    this.engagementRefreshInFlight = true;

    forkJoin({
      status: this.reactionService.getStatus(this.post.id, 'POST').pipe(
        catchError(() => of({ isReacted: !!this.post.isLiked, reactionType: null })),
      ),
      summary: this.reactionService.getSummary(this.post.id, 'POST').pipe(
        catchError(() => of({ total: this.post.likes ?? 0, counts: {} })),
      ),
      commentsCount: this.commentService.getCommentsCount(this.post.id).pipe(
        catchError(() => of(this.post.comments ?? 0)),
      ),
    }).subscribe({
      next: ({ status, summary, commentsCount }) => {
        this.post.isLiked = status.isReacted;
        this.post.likes = Math.max(0, Number(summary.total ?? this.post.likes ?? 0));
        this.post.comments = Math.max(0, Number(commentsCount ?? this.post.comments ?? 0));
        this.engagementRefreshInFlight = false;
      },
      error: () => {
        this.engagementRefreshInFlight = false;
      },
    });
  }
}
