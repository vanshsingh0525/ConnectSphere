import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';

import { LikedByModalComponent } from '../liked-by-modal/liked-by-modal.component';
import { ProfilePostItem } from '../../models/profile-ui.model';
import { CommentService } from '../../services/comment.service';
import { LikedByAccount, LikedByService } from '../../services/liked-by.service';
import { ReactionService } from '../../services/reaction.service';

@Component({
  selector: 'app-post-grid',
  standalone: true,
  imports: [CommonModule, LikedByModalComponent],
  templateUrl: './post-grid.component.html',
  styleUrl: './post-grid.component.css',
})
export class PostGridComponent implements OnChanges {
  @Input() posts: ProfilePostItem[] = [];
  @Input() showEmptyAction = true;
  @Input() showEmptyState = true;
  @Input() emptyStateTitle = 'Share Photos';
  @Input() emptyStateDescription = 'When you share photos, they will appear here';
  @Input() emptyStateIcon = 'O';
  likesModalOpen = false;
  likesModalLoading = false;
  likesModalError = '';
  likedByAccounts: LikedByAccount[] = [];
  private readonly hoverRefreshInFlight = new Set<number>();

  constructor(
    private readonly commentService: CommentService,
    private readonly reactionService: ReactionService,
    private readonly likedByService: LikedByService,
    private readonly router: Router,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['posts'] || this.posts.length === 0) {
      return;
    }

    for (const post of this.posts) {
      this.refreshPostCounters(post);
    }
  }

  toggleLike(post: ProfilePostItem): void {
    if (post.likeInFlight) {
      return;
    }

    const wasLiked = !!post.isLiked;
    post.isLiked = !wasLiked;
    post.likes = Math.max(0, post.likes + (wasLiked ? -1 : 1));
    post.likeInFlight = true;

    const request$ = wasLiked
      ? this.reactionService.removeReaction(post.id, 'POST')
      : this.reactionService.addReaction(post.id, 'POST', 'LIKE');

    request$.subscribe({
      next: () => {
        post.likeInFlight = false;
        this.refreshPostCounters(post);
      },
      error: () => {
        post.isLiked = wasLiked;
        post.likes = Math.max(0, post.likes + (wasLiked ? 1 : -1));
        post.likeInFlight = false;
      },
    });
  }

  openPost(postId: number): void {
    void this.router.navigate(['/post', postId], {
      queryParams: { from: this.router.url },
    });
  }

  openLikesModal(post: ProfilePostItem, event: Event): void {
    event.stopPropagation();

    this.likesModalOpen = true;
    this.likesModalLoading = true;
    this.likesModalError = '';

    this.likedByService.getAccounts(post.id, 'POST', 'LIKE').subscribe({
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
    void this.router.navigate(['/profile', username]);
  }

  refreshPostCounters(post: ProfilePostItem): void {
    if (this.hoverRefreshInFlight.has(post.id)) {
      return;
    }

    this.hoverRefreshInFlight.add(post.id);

    forkJoin({
      summary: this.reactionService.getSummary(post.id, 'POST').pipe(
        catchError(() => of({ total: post.likes })),
      ),
      commentsCount: this.commentService.getCommentsCount(post.id).pipe(
        catchError(() => of(post.comments)),
      ),
      status: this.reactionService.getStatus(post.id, 'POST').pipe(
        catchError(() => of({ isReacted: !!post.isLiked, reactionType: null })),
      ),
    }).subscribe({
      next: ({ summary, commentsCount, status }) => {
        post.likes = summary.total ?? post.likes;
        post.comments = commentsCount ?? post.comments;
        post.isLiked = status.isReacted;
        this.hoverRefreshInFlight.delete(post.id);
      },
      error: () => {
        this.hoverRefreshInFlight.delete(post.id);
      },
    });
  }
}
