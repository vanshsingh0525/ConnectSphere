import { CommonModule, Location } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, catchError, forkJoin, map, of, switchMap, takeUntil } from 'rxjs';

import { LikedByModalComponent } from '../components/liked-by-modal/liked-by-modal.component';
import { TaggedUsersModalComponent } from '../components/tagged-users-modal/tagged-users-modal.component';
import { VerifiedBadgeComponent } from '../components/verified-badge/verified-badge.component';
import { ImageFallbackDirective } from '../directives/image-fallback.directive';
import { AuthService, PublicUserProfile } from '../services/auth.service';
import { CommentItem, CommentService } from '../services/comment.service';
import { FollowService } from '../services/follow.service';
import { LikedByAccount, LikedByService } from '../services/liked-by.service';
import { PostItem, PostService } from '../services/post.service';
import { ReactionService } from '../services/reaction.service';
import { DEFAULT_AVATAR_URL, normalizeProfileImageUrl } from '../utils/avatar.util';
import { parsePostEntityText, PostEntityTextToken } from '../utils/post-entity-text.util';

interface CommentViewModel extends CommentItem {
  username: string;
  profileImageUrl: string;
  verified?: boolean;
  isLiked: boolean;
  likeBusy: boolean;
  threadRootId: number;
  leadingMentionUsername: string | null;
  bodyText: string;
  replies: CommentViewModel[];
}

interface MediaSlide {
  url: string;
  type: 'image' | 'video';
}

interface ReplyTarget {
  commentId: number;
  username: string;
  threadRootId: number;
}

@Component({
  selector: 'app-post-view-page',
  standalone: true,
  imports: [CommonModule, FormsModule, ImageFallbackDirective, LikedByModalComponent, TaggedUsersModalComponent, VerifiedBadgeComponent],
  templateUrl: './post-view.component.html',
  styleUrl: './post-view.component.css',
})
export class PostViewComponent implements OnInit, OnDestroy {
  @ViewChild('commentInput') commentInput?: ElementRef<HTMLInputElement>;
  @ViewChild('postMenuWrap') postMenuWrap?: ElementRef<HTMLElement>;

  loading = true;
  submittingComment = false;
  likeBusy = false;
  followBusy = false;
  deletingPost = false;
  saveBusy = false;
  shareBusy = false;
  menuOpen = false;
  errorMessage = '';
  commentText = '';
  commentErrorMessage = '';
  deleteErrorMessage = '';
  activeReplyTarget: ReplyTarget | null = null;
  commentMenuOpenId: number | null = null;
  editingCommentId: number | null = null;
  editText = '';
  editBusy = false;
  saveToastMessage = '';
  saveToastTone: 'saved' | 'unsaved' = 'saved';
  showSaveToast = false;
  shareFeedbackMessage = '';
  emojiPickerOpen = false;
  likesModalOpen = false;
  likesModalLoading = false;
  likesModalError = '';
  likesModalTitle = 'Likes';
  taggedUsersModalOpen = false;
  mediaItems: MediaSlide[] = [];
  activeMediaIndex = 0;
  post: PostItem | null = null;
  author: PublicUserProfile | null = null;
  comments: CommentViewModel[] = [];
  likedByAccounts: LikedByAccount[] = [];
  taggedUserEntries: Array<{ username: string; name: string }> = [];
  likeCount = 0;
  isLiked = false;
  isFollowingAuthor = false;
  isFollowPending = false;
  currentUserId: number | null = null;
  readonly defaultAvatarUrl = DEFAULT_AVATAR_URL;
  readonly isAuthenticated: boolean;
  readonly emojiOptions = ['😀', '😂', '😍', '🔥', '❤️', '🙌', '🎉', '😎', '🥳', '👏', '🤍', '🤩'];
  private readonly editedTimeDriftMs = 1000;
  private readonly inferredEditThresholdMs = 30 * 1000;

  private readonly destroy$ = new Subject<void>();
  private readonly expandedReplyThreads = new Set<number>();
  private saveToastTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private previousBodyOverflow = '';
  private returnToUrl: string | null = null;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly location: Location,
    private readonly postService: PostService,
    private readonly authService: AuthService,
    private readonly reactionService: ReactionService,
    private readonly commentService: CommentService,
    private readonly followService: FollowService,
    private readonly likedByService: LikedByService,
  ) {
    this.isAuthenticated = this.authService.isAuthenticated();
  }

  ngOnInit(): void {
    this.currentUserId = this.authService.getAuthUser()?.id ?? null;
    this.lockBackgroundScroll();
    this.returnToUrl = this.readReturnUrl();

    this.route.paramMap
      .pipe(
        takeUntil(this.destroy$),
        switchMap((params) => {
          const rawId = params.get('id');
          const postId = Number(rawId);

          if (!rawId || Number.isNaN(postId) || postId <= 0) {
            this.errorMessage = 'Invalid post id.';
            this.loading = false;
            return of(null);
          }

          this.loading = true;
          this.errorMessage = '';
          this.commentErrorMessage = '';
          this.deleteErrorMessage = '';
          this.menuOpen = false;
          this.activeReplyTarget = null;
          this.expandedReplyThreads.clear();

          return this.loadPostView(postId);
        }),
      )
      .subscribe({
        next: () => {
          this.loading = false;
        },
        error: () => {
          this.loading = false;
          this.errorMessage = 'Unable to load this post right now.';
        },
      });
  }

  get activeMedia(): MediaSlide | null {
    return this.mediaItems[this.activeMediaIndex] ?? null;
  }

  get hasMultipleMedia(): boolean {
    return this.mediaItems.length > 1;
  }

  get canSubmitComment(): boolean {
    if (!this.post || this.submittingComment) {
      return false;
    }

    if (this.activeReplyTarget) {
      return this.extractReplyBody(this.commentText).length > 0;
    }

    return this.commentText.trim().length > 0;
  }

  get canDeletePost(): boolean {
    return !!this.post && this.currentUserId === this.post.authorId && !this.deletingPost;
  }

  get canEditPost(): boolean {
    return !!this.post && this.currentUserId === this.post.authorId;
  }

  get canToggleSave(): boolean {
    return !!this.post && !this.saveBusy;
  }

  get canFollowAuthor(): boolean {
    return !!this.post && this.currentUserId != null && this.currentUserId !== this.post.authorId;
  }

  get isPostEdited(): boolean {
    if (!this.post) {
      return false;
    }

    return this.wasContentEdited(this.post.createdAt, this.post.updatedAt, this.post.edited === true, true);
  }

  get postTimeLabel(): string {
    return this.post?.createdAt ?? '';
  }

  get postTokens(): PostEntityTextToken[] {
    return parsePostEntityText(this.post?.text ?? '');
  }

  get captionTokens(): PostEntityTextToken[] {
    const rawCaption = this.post?.text ?? '';
    const authorUsername = (this.author?.username ?? '').trim();
    return parsePostEntityText(this.stripLeadingAuthorFromCaption(rawCaption, authorUsername));
  }

  get relativePostTimeLabel(): string {
    if (!this.post?.createdAt) {
      return '';
    }

    return this.getRelativeCommentTimeLabel(this.post.createdAt);
  }

  getRelativeCommentTimeLabel(value: string): string {
    const createdAt = new Date(value).getTime();
    if (Number.isNaN(createdAt)) {
      return 'Just now';
    }

    const diffMs = Math.max(0, Date.now() - createdAt);
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    const week = 7 * day;

    if (diffMs < minute) {
      return 'Just now';
    }

    if (diffMs < hour) {
      return `${Math.floor(diffMs / minute)}m`;
    }

    if (diffMs < day) {
      return `${Math.floor(diffMs / hour)}h`;
    }

    if (diffMs < week) {
      return `${Math.floor(diffMs / day)}d`;
    }

    return `${Math.floor(diffMs / week)}w`;
  }

  previousMedia(): void {
    if (!this.hasMultipleMedia) {
      return;
    }

    this.activeMediaIndex = (this.activeMediaIndex - 1 + this.mediaItems.length) % this.mediaItems.length;
  }

  nextMedia(): void {
    if (!this.hasMultipleMedia) {
      return;
    }

    this.activeMediaIndex = (this.activeMediaIndex + 1) % this.mediaItems.length;
  }

  selectMedia(index: number): void {
    if (index < 0 || index >= this.mediaItems.length) {
      return;
    }

    this.activeMediaIndex = index;
  }

  onMediaDoubleClick(): void {
    if (!this.isLiked && !this.likeBusy) {
      this.toggleLike();
    }
  }

  toggleLike(): void {
    if (!this.post || this.likeBusy || !this.requireAuthenticationForAction()) {
      return;
    }

    const wasLiked = this.isLiked;
    this.isLiked = !wasLiked;
    this.likeCount = Math.max(0, this.likeCount + (wasLiked ? -1 : 1));
    this.likeBusy = true;
    this.post.likesCount = this.likeCount;

    const request$ = wasLiked
      ? this.reactionService.removeReaction(this.post.id, 'POST')
      : this.reactionService.addReaction(this.post.id, 'POST', 'LIKE');

    request$.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        if (this.post) {
          this.post.likesCount = this.likeCount;
        }
        this.likeBusy = false;
      },
      error: () => {
        this.isLiked = wasLiked;
        this.likeCount = Math.max(0, this.likeCount + (wasLiked ? 1 : -1));
        if (this.post) {
          this.post.likesCount = this.likeCount;
        }
        this.likeBusy = false;
      },
    });
  }

  submitComment(): void {
    if (!this.post || !this.canSubmitComment || !this.requireAuthenticationForAction()) {
      return;
    }

    const replyTarget = this.activeReplyTarget;
    const replyPrefix = replyTarget ? this.buildReplyPrefix(replyTarget.username) : '';
    const shouldReply = !!replyTarget && this.commentText.startsWith(replyPrefix);
    const content = shouldReply
      ? this.buildReplyContent(replyTarget!.username, this.commentText)
      : this.commentText.trim();
    const threadRootId = shouldReply ? replyTarget!.threadRootId : undefined;

    if (!shouldReply && this.activeReplyTarget) {
      this.activeReplyTarget = null;
    }

    this.submittingComment = true;
    this.commentErrorMessage = '';

    this.commentService.addComment(this.post.id, content, threadRootId).pipe(
      switchMap(() => this.hydrateComments(this.post!.id, this.author?.id ?? this.post!.authorId)),
      takeUntil(this.destroy$),
    ).subscribe({
      next: (comments) => {
        this.comments = comments;
        this.commentText = '';
        this.activeReplyTarget = null;
        if (this.post) {
          this.post.commentsCount = this.countActiveComments(comments);
        }
        this.submittingComment = false;
      },
      error: (error: HttpErrorResponse) => {
        this.submittingComment = false;
        const fallback = shouldReply ? 'Unable to post reply right now.' : 'Unable to post comment right now.';
        this.commentErrorMessage = this.extractCommentError(error, fallback);
      },
    });
  }

  toggleCommentLike(comment: CommentViewModel): void {
    if (comment.likeBusy || !this.requireAuthenticationForAction()) {
      return;
    }

    const wasLiked = comment.isLiked;
    const previousLikesCount = comment.likesCount;
    comment.likeBusy = true;
    comment.isLiked = !wasLiked;
    comment.likesCount = Math.max(0, previousLikesCount + (wasLiked ? -1 : 1));

    const request$ = wasLiked
      ? this.reactionService.removeReaction(comment.id, 'COMMENT')
      : this.reactionService.addReaction(comment.id, 'COMMENT', 'LIKE');

    request$.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        comment.likeBusy = false;
      },
      error: () => {
        comment.likeBusy = false;
        comment.isLiked = wasLiked;
        comment.likesCount = previousLikesCount;
      },
    });
  }

  canDeleteComment(comment: CommentViewModel): boolean {
    if (!this.post || this.currentUserId == null || comment.deleted) {
      return false;
    }

    return this.currentUserId === comment.authorId || this.currentUserId === this.post.authorId;
  }

  canEditComment(comment: CommentViewModel): boolean {
    if (this.currentUserId == null || comment.deleted) {
      return false;
    }

    return this.currentUserId === comment.authorId;
  }

  canManageComment(comment: CommentViewModel): boolean {
    return this.canDeleteComment(comment) || this.canEditComment(comment);
  }

  toggleCommentMenu(comment: CommentViewModel, event: Event): void {
    event.stopPropagation();
    this.commentMenuOpenId = this.commentMenuOpenId === comment.id ? null : comment.id;
  }

  closeCommentMenu(): void {
    this.commentMenuOpenId = null;
  }

  startEditComment(comment: CommentViewModel, event?: Event): void {
    event?.stopPropagation();
    if (!this.canEditComment(comment)) {
      return;
    }

    this.editingCommentId = comment.id;
    this.editText = comment.bodyText;
    this.commentMenuOpenId = null;
  }

  cancelEdit(): void {
    this.editingCommentId = null;
    this.editText = '';
  }

  saveEdit(comment: CommentViewModel): void {
    if (!this.post || !this.canEditComment(comment) || this.editingCommentId !== comment.id) {
      return;
    }

    const trimmed = this.editText.trim();
    if (!trimmed) {
      return;
    }

    const prefix = comment.leadingMentionUsername ? this.buildReplyPrefix(comment.leadingMentionUsername) : '';
    const content = `${prefix}${trimmed}`.trim();

    this.editBusy = true;
    this.commentErrorMessage = '';

    this.commentService.updateComment(comment.id, content).pipe(
      switchMap(() => this.hydrateComments(this.post!.id, this.author?.id ?? this.post!.authorId)),
      takeUntil(this.destroy$),
    ).subscribe({
      next: (comments) => {
        this.comments = comments;
        this.editingCommentId = null;
        this.editText = '';
        this.editBusy = false;
      },
      error: () => {
        this.editBusy = false;
        this.commentErrorMessage = 'Unable to edit comment right now.';
      },
    });
  }

  deleteComment(comment: CommentViewModel): void {
    if (!this.canDeleteComment(comment)) {
      return;
    }

    this.commentMenuOpenId = null;

    this.commentErrorMessage = '';

    this.commentService.deleteComment(comment.id).pipe(
      switchMap(() => this.hydrateComments(this.post!.id, this.author?.id ?? this.post!.authorId)),
      takeUntil(this.destroy$),
    ).subscribe({
      next: (comments) => {
        this.comments = comments;
        if (this.post) {
          this.post.commentsCount = this.countActiveComments(comments);
        }
      },
      error: () => {
        this.commentErrorMessage = 'Unable to delete comment right now.';
      },
    });
  }

  openReply(comment: CommentViewModel): void {
    if (!this.requireAuthenticationForAction()) {
      return;
    }

    this.activeReplyTarget = {
      commentId: comment.id,
      username: comment.username,
      threadRootId: comment.threadRootId,
    };
    this.commentText = this.buildReplyPrefix(comment.username);
    this.commentErrorMessage = '';
    this.expandedReplyThreads.add(comment.threadRootId);
    this.focusCommentInput(this.commentText.length);
  }

  hasReplies(comment: CommentViewModel): boolean {
    return (comment.replies?.length ?? 0) > 0;
  }

  areRepliesExpanded(comment: CommentViewModel): boolean {
    return this.expandedReplyThreads.has(comment.id);
  }

  toggleReplies(comment: CommentViewModel): void {
    if (!this.hasReplies(comment)) {
      return;
    }

    if (this.expandedReplyThreads.has(comment.id)) {
      this.expandedReplyThreads.delete(comment.id);
      return;
    }

    this.expandedReplyThreads.add(comment.id);
  }

  openProfile(username: string): void {
    const normalized = username.trim().toLowerCase();
    if (!normalized) {
      return;
    }

    this.closeLikesModal();
    void this.router.navigate(['/profile', normalized]);
  }

  openHashtag(tag: string): void {
    const normalized = tag.trim().replace(/^#/, '');
    if (!normalized) {
      return;
    }

    void this.router.navigate(['/hashtag', normalized]);
  }

  openTaggedUsers(event?: Event): void {
    event?.stopPropagation();
    if ((this.post?.taggedUsers?.length ?? 0) === 0) {
      return;
    }

    this.taggedUsersModalOpen = true;
  }

  closeTaggedUsers(): void {
    this.taggedUsersModalOpen = false;
  }

  openTaggedUser(username: string): void {
    this.closeTaggedUsers();
    const normalized = username.trim().replace(/^@/, '').toLowerCase();
    if (!normalized) {
      return;
    }

    void this.router.navigate(['/profile', normalized]);
  }

  openLikesModal(): void {
    if (!this.post) {
      return;
    }

    this.likesModalOpen = true;
    this.likesModalLoading = true;
    this.likesModalError = '';
    this.likesModalTitle = 'Likes';

    this.likedByService.getAccounts(this.post.id, 'POST', 'LIKE').pipe(takeUntil(this.destroy$)).subscribe({
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

  openCommentLikesModal(comment: CommentViewModel, event?: Event): void {
    event?.stopPropagation();
    if ((comment.likesCount ?? 0) <= 0) {
      return;
    }

    this.likesModalOpen = true;
    this.likesModalLoading = true;
    this.likesModalError = '';
    this.likesModalTitle = 'Comment likes';

    this.likedByService.getAccounts(comment.id, 'COMMENT', 'LIKE').pipe(takeUntil(this.destroy$)).subscribe({
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

  close(): void {
    if (this.returnToUrl) {
      void this.router.navigateByUrl(this.returnToUrl);
      return;
    }

    if (window.history.length > 1) {
      this.location.back();
      return;
    }

    void this.router.navigate(['/dashboard']);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.emojiPickerOpen) {
      this.emojiPickerOpen = false;
      return;
    }

    if (this.likesModalOpen) {
      this.closeLikesModal();
      return;
    }

    if (this.taggedUsersModalOpen) {
      this.closeTaggedUsers();
      return;
    }

    this.close();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.emojiPickerOpen) {
      this.emojiPickerOpen = false;
    }

    if (this.commentMenuOpenId != null) {
      this.commentMenuOpenId = null;
    }

    if (this.menuOpen) {
      const menuContainer = this.postMenuWrap?.nativeElement;
      const target = event.target as Node | null;
      if (!menuContainer || !target || !menuContainer.contains(target)) {
        this.menuOpen = false;
      }
    }
  }

  deletePost(): void {
    if (!this.post || !this.canDeletePost || !this.requireAuthenticationForAction()) {
      return;
    }

    const confirmed = window.confirm('Delete this post permanently?');
    if (!confirmed) {
      return;
    }

    this.deletingPost = true;
    this.deleteErrorMessage = '';

    this.postService.deletePost(this.post.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.deletingPost = false;
        void this.router.navigate(['/dashboard']);
      },
      error: () => {
        this.deletingPost = false;
        this.deleteErrorMessage = 'Unable to delete post right now.';
      },
    });
  }

  editPost(): void {
    if (!this.post || !this.canEditPost || !this.requireAuthenticationForAction()) {
      return;
    }

    this.menuOpen = false;
    void this.router.navigate(['/dashboard'], {
      queryParams: { editPostId: this.post.id },
    });
  }

  toggleMenu(): void {
    this.menuOpen = !this.menuOpen;
  }

  focusCommentInput(cursorPosition?: number): void {
    const input = this.commentInput?.nativeElement;
    if (!input) {
      return;
    }

    input.focus();
    if (typeof cursorPosition === 'number') {
      input.setSelectionRange(cursorPosition, cursorPosition);
    }
  }

  toggleEmojiPicker(event: Event): void {
    event.stopPropagation();
    this.emojiPickerOpen = !this.emojiPickerOpen;
  }

  addEmoji(emoji: string, event?: Event): void {
    event?.stopPropagation();
    this.commentText = `${this.commentText}${emoji}`;
    this.emojiPickerOpen = false;

    setTimeout(() => {
      this.commentInput?.nativeElement.focus();
    });
  }

  toggleFollowAuthor(): void {
    if (!this.post || !this.canFollowAuthor || this.followBusy || !this.requireAuthenticationForAction()) {
      return;
    }

    this.followBusy = true;
    const request$ = this.isFollowingAuthor || this.isFollowPending
      ? this.followService.unfollowUser(this.post.authorId)
      : this.followService.followUser(this.post.authorId);

    request$.pipe(takeUntil(this.destroy$)).subscribe({
      next: (response) => {
        this.isFollowingAuthor = response.isFollowing;
        this.isFollowPending = response.isPending;
        this.followBusy = false;
      },
      error: () => {
        this.followBusy = false;
      },
    });
  }

  sharePost(): void {
    if (!this.post || this.shareBusy) {
      return;
    }

    const absoluteUrl = `${window.location.origin}/post/${this.post.id}`;
    this.shareBusy = true;

    const finish = (message: string, incrementShareCount = false) => {
      if (incrementShareCount && this.post) {
        this.post.sharesCount += 1;
      }
      this.shareFeedbackMessage = message;
      this.shareBusy = false;
      window.setTimeout(() => {
        if (this.shareFeedbackMessage === message) {
          this.shareFeedbackMessage = '';
        }
      }, 2200);
    };

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(absoluteUrl).then(
        () => finish('Post link copied.', true),
        () => finish('Unable to copy post link.'),
      );
      return;
    }

    finish('Copy is not supported in this browser.');
  }

  toggleSave(): void {
    if (!this.post || !this.canToggleSave || !this.requireAuthenticationForAction()) {
      return;
    }

    const wasSaved = !!this.post.saved;
    this.post.saved = !wasSaved;
    this.saveBusy = true;

    if (wasSaved) {
      this.postService.unsavePost(this.post.id).pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          this.saveBusy = false;
          this.menuOpen = false;
          this.showSaveToastMessage('Post removed from saved', 'unsaved');
        },
        error: () => {
          if (this.post) {
            this.post.saved = wasSaved;
          }
          this.saveBusy = false;
        },
      });
      return;
    }

    this.postService.savePost(this.post.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.saveBusy = false;
        this.menuOpen = false;
        this.showSaveToastMessage('Post saved successfully', 'saved');
      },
      error: () => {
        if (this.post) {
          this.post.saved = wasSaved;
        }
        this.saveBusy = false;
      },
    });
  }

  ngOnDestroy(): void {
    if (this.saveToastTimeoutId) {
      clearTimeout(this.saveToastTimeoutId);
      this.saveToastTimeoutId = null;
    }

    this.unlockBackgroundScroll();
    this.destroy$.next();
    this.destroy$.complete();
  }

  dismissSaveToast(): void {
    this.showSaveToast = false;
    if (this.saveToastTimeoutId) {
      clearTimeout(this.saveToastTimeoutId);
      this.saveToastTimeoutId = null;
    }
  }

  trackComment(index: number, comment: CommentViewModel): number {
    return comment.id;
  }

  shouldShowCommentEdited(comment: CommentViewModel): boolean {
    return this.wasContentEdited(comment.createdAt, comment.updatedAt, comment.edited === true, false);
  }

  private loadPostView(postId: number) {
    return this.postService.getPostById(postId).pipe(
      switchMap((post) => {
        post.likesCount = post.likesCount ?? 0;
        post.commentsCount = post.commentsCount ?? 0;
        post.sharesCount = post.sharesCount ?? 0;
        post.saved = post.saved ?? false;
        post.archived = post.archived ?? false;
        post.deleted = post.deleted ?? false;

        this.post = post;
        this.mediaItems = this.parseMediaItems(post.mediaUrl);
        this.activeMediaIndex = 0;

        return forkJoin({
          users: this.authService.getPublicProfiles().pipe(catchError(() => of([] as PublicUserProfile[]))),
          summary: this.reactionService.getSummary(post.id, 'POST').pipe(catchError(() => of({ total: post.likesCount ?? 0, counts: {} }))),
          status: this.reactionService.getStatus(post.id, 'POST').pipe(catchError(() => of({ isReacted: false, reactionType: null }))),
          comments: this.commentService.getCommentsByPost(post.id).pipe(catchError(() => of([] as CommentItem[]))),
          commentsCount: this.commentService.getCommentsCount(post.id).pipe(catchError(() => of(post.commentsCount ?? 0))),
          followStatus: this.loadFollowStatus(post.authorId),
        });
      }),
      switchMap(({ users, summary, status, comments, commentsCount, followStatus }) => {
        const userMap = new Map(users.map((user) => [user.id, user]));
        this.author = userMap.get(this.post!.authorId) ?? null;
        const userByUsername = new Map(users.map((user) => [user.username.toLowerCase(), user]));
        this.taggedUserEntries = (this.post?.taggedUsers ?? []).map((username) => {
          const normalized = username.trim().replace(/^@/, '').toLowerCase();
          const user = userByUsername.get(normalized);
          return {
            username: normalized,
            name: user?.name?.trim() || normalized,
          };
        });
        this.likeCount = summary.total ?? this.post?.likesCount ?? 0;
        this.isLiked = status.isReacted;
        this.isFollowingAuthor = followStatus.isFollowing;
        this.isFollowPending = followStatus.isPending;

        if (this.post) {
          this.post.likesCount = this.likeCount;
          this.post.commentsCount = commentsCount ?? this.post.commentsCount ?? 0;
        }

        return this.hydrateCommentReactions(comments, userMap).pipe(
          map((hydratedComments) => {
            this.comments = hydratedComments;
            if (this.post) {
              this.post.commentsCount = this.countActiveComments(hydratedComments);
            }
            return true;
          }),
        );
      }),
    );
  }

  private hydrateComments(postId: number, fallbackAuthorId: number) {
    return this.commentService.getCommentsByPost(postId).pipe(
      switchMap((comments) =>
        this.authService.getPublicProfiles().pipe(
          catchError(() => of([] as PublicUserProfile[])),
          switchMap((users) => {
            const userMap = new Map(users.map((user) => [user.id, user]));
            if (!this.author && fallbackAuthorId) {
              this.author = userMap.get(fallbackAuthorId) ?? null;
            }
            return this.hydrateCommentReactions(comments, userMap);
          }),
        ),
      ),
    );
  }

  private toCommentView(comment: CommentItem, userMap: Map<number, PublicUserProfile>): CommentViewModel {
    const user = userMap.get(comment.authorId);
    const contentParts = this.extractLeadingMention(comment.content);
    return {
      ...comment,
      username: user?.username ?? `user${comment.authorId}`,
      profileImageUrl: normalizeProfileImageUrl(user?.profileImageUrl),
      verified: user?.verified ?? false,
      isLiked: false,
      likeBusy: false,
      threadRootId: comment.id,
      leadingMentionUsername: contentParts.username,
      bodyText: contentParts.text,
      replies: [],
    };
  }

  private hydrateCommentReactions(comments: CommentItem[], userMap: Map<number, PublicUserProfile>) {
    const sortedComments = this.sortCommentsByNewest(comments);
    const commentViews = sortedComments.map((comment) => this.toCommentThread(comment, userMap));
    const flattenedComments = this.flattenComments(commentViews);

    if (flattenedComments.length === 0) {
      return of(commentViews);
    }

    return forkJoin(
      flattenedComments.map((comment) =>
        this.reactionService.getStatus(comment.id, 'COMMENT').pipe(
          map((status) => ({ commentId: comment.id, isLiked: status.isReacted })),
          catchError(() => of({ commentId: comment.id, isLiked: false })),
        ),
      ),
    ).pipe(
      map((statuses) => {
        const likedMap = new Map(statuses.map((status) => [status.commentId, status.isLiked]));
        flattenedComments.forEach((comment) => {
          comment.isLiked = likedMap.get(comment.id) ?? false;
        });
        return commentViews;
      }),
    );
  }

  private flattenComments(comments: CommentViewModel[]): CommentViewModel[] {
    const flattened: CommentViewModel[] = [];

    comments.forEach((comment) => {
      flattened.push(comment);
      if (comment.replies.length > 0) {
        flattened.push(...this.flattenComments(comment.replies));
      }
    });

    return flattened;
  }

  private toCommentThread(comment: CommentItem, userMap: Map<number, PublicUserProfile>): CommentViewModel {
    const rootComment = this.toCommentView(comment, userMap);
    rootComment.replies = this.flattenReplies(comment.replies ?? [], userMap, rootComment.id);
    return rootComment;
  }

  private flattenReplies(
    replies: CommentItem[],
    userMap: Map<number, PublicUserProfile>,
    threadRootId: number,
  ): CommentViewModel[] {
    const flattened: CommentViewModel[] = [];

    replies.forEach((reply) => {
      const replyView = this.toCommentView(reply, userMap);
      replyView.threadRootId = threadRootId;
      flattened.push(replyView);

      if ((reply.replies?.length ?? 0) > 0) {
        flattened.push(...this.flattenReplies(reply.replies ?? [], userMap, threadRootId));
      }
    });

    return flattened;
  }

  private sortCommentsByNewest(comments: CommentItem[]): CommentItem[] {
    return [...comments]
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .map((comment) => ({
        ...comment,
        replies: this.sortCommentsByNewest(comment.replies ?? []),
      }));
  }

  private countActiveComments(comments: CommentViewModel[]): number {
    return comments.reduce((total, comment) => {
      const ownCount = comment.deleted ? 0 : 1;
      return total + ownCount + this.countActiveComments(comment.replies);
    }, 0);
  }

  private loadFollowStatus(authorId: number) {
    if (this.currentUserId == null || this.currentUserId === authorId) {
      return of({
        isFollowing: false,
        isPending: false,
        canViewContent: true,
        targetPublic: true,
      });
    }

    return this.followService.getFollowStatus(authorId).pipe(
      catchError(() =>
        of({
          isFollowing: false,
          isPending: false,
          canViewContent: true,
          targetPublic: true,
        }),
      ),
    );
  }

  private parseMediaItems(mediaUrl: string | null): MediaSlide[] {
    if (!mediaUrl || !mediaUrl.trim()) {
      return [];
    }

    const raw = mediaUrl.trim();
    const parsedUrls = this.extractMediaUrls(raw);

    return parsedUrls.map((url) => ({
      url,
      type: this.detectMediaType(url),
    }));
  }

  private extractMediaUrls(raw: string): string[] {
    if (raw.startsWith('[') && raw.endsWith(']')) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          return parsed
            .map((value) => String(value).trim())
            .filter((value) => value.length > 0);
        }
      } catch {
        // Fall through to string parsing.
      }
    }

    const commaSeparated = raw
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    if (commaSeparated.length > 1) {
      return commaSeparated;
    }

    return [raw];
  }

  private detectMediaType(url: string): 'image' | 'video' {
    const normalized = url.toLowerCase();
    if (
      normalized.endsWith('.mp4') ||
      normalized.endsWith('.webm') ||
      normalized.endsWith('.mov') ||
      normalized.includes('/video/')
    ) {
      return 'video';
    }

    return 'image';
  }

  private extractCommentError(error: HttpErrorResponse, fallback: string): string {
    const backendMessage = (error.error?.message as string | undefined)?.trim();
    if (backendMessage) {
      return backendMessage;
    }

    if (typeof error.error === 'string' && error.error.trim()) {
      return error.error;
    }

    if (error.status === 401 || error.status === 403) {
      return 'Session expired. Please sign in again.';
    }

    if (error.status === 0) {
      return 'Comment service is unreachable. Check api-gateway, comment-service, and post-service.';
    }

    return fallback;
  }

  private showSaveToastMessage(message: string, tone: 'saved' | 'unsaved'): void {
    this.saveToastMessage = message;
    this.saveToastTone = tone;
    this.showSaveToast = true;

    if (this.saveToastTimeoutId) {
      clearTimeout(this.saveToastTimeoutId);
    }

    this.saveToastTimeoutId = setTimeout(() => {
      this.showSaveToast = false;
      this.saveToastTimeoutId = null;
    }, 2800);
  }

  private lockBackgroundScroll(): void {
    this.previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }

  private unlockBackgroundScroll(): void {
    document.body.style.overflow = this.previousBodyOverflow;
  }

  private buildReplyPrefix(username: string): string {
    return `@${username.trim()} `;
  }

  private buildReplyContent(username: string, draft: string): string {
    const prefix = this.buildReplyPrefix(username);
    const body = this.extractReplyBody(draft);
    return `${prefix}${body}`.trim();
  }

  private extractReplyBody(draft: string): string {
    return draft.trim().replace(/^@\S+\s*/, '').trim();
  }

  private extractLeadingMention(content: string): { username: string | null; text: string } {
    const trimmed = content.trim();
    const mentionMatch = /^@([A-Za-z0-9._]+)\s*(.*)$/s.exec(trimmed);
    if (!mentionMatch) {
      return {
        username: null,
        text: trimmed,
      };
    }

    return {
      username: mentionMatch[1] ?? null,
      text: (mentionMatch[2] ?? '').trim(),
    };
  }

  private stripLeadingAuthorFromCaption(content: string, authorUsername: string): string {
    const trimmed = content.trim();
    if (!trimmed || !authorUsername) {
      return trimmed;
    }

    const escapedUsername = authorUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const leadingPattern = new RegExp(`^@?${escapedUsername}\\s*:?\\s*`, 'i');
    return trimmed.replace(leadingPattern, '').trim();
  }

  private wasContentEdited(
    createdAtRaw: string | null | undefined,
    updatedAtRaw: string | null | undefined,
    explicitEditedFlag: boolean,
    requireExplicitFlag: boolean,
  ): boolean {
    if (!createdAtRaw || !updatedAtRaw) {
      return false;
    }

    const createdAt = new Date(createdAtRaw).getTime();
    const updatedAt = new Date(updatedAtRaw).getTime();
    if (Number.isNaN(createdAt) || Number.isNaN(updatedAt)) {
      return false;
    }

    const delta = updatedAt - createdAt;
    if (delta <= this.editedTimeDriftMs) {
      return false;
    }

    if (requireExplicitFlag) {
      return explicitEditedFlag;
    }

    return explicitEditedFlag || delta >= this.inferredEditThresholdMs;
  }

  private requireAuthenticationForAction(): boolean {
    if (this.isAuthenticated) {
      return true;
    }

    void this.router.navigate(['/login']);
    return false;
  }

  private readReturnUrl(): string | null {
    const raw = this.route.snapshot.queryParamMap.get('from')?.trim() ?? '';
    if (!raw) {
      return null;
    }

    // Allow only app-internal relative routes.
    if (!raw.startsWith('/')) {
      return null;
    }

    return raw;
  }
}
