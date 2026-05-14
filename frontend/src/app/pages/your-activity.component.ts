import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { catchError, finalize, forkJoin, map, of, switchMap } from 'rxjs';

import { SidebarComponent } from '../components/sidebar/sidebar.component';
import { StoryViewerComponent } from '../components/story-viewer/story-viewer.component';
import { StoryItem, StoryMediaItem } from '../models/dashboard-ui.model';
import { AuthService } from '../services/auth.service';
import { CommentItem, CommentService, UserCommentActivityItem } from '../services/comment.service';
import { PostItem, PostService } from '../services/post.service';
import { ReactionService, UserPostReactionResponse } from '../services/reaction.service';
import { StoryDto, StoryService } from '../services/story.service';

type ActivityTab = 'likes' | 'comments' | 'archived' | 'deleted';
type FilterWindow = 'all' | '7d' | '30d';

interface LikedPostItem {
  reaction: UserPostReactionResponse;
  post: PostItem;
}

@Component({
  selector: 'app-your-activity-page',
  standalone: true,
  imports: [CommonModule, FormsModule, SidebarComponent, StoryViewerComponent],
  templateUrl: './your-activity.component.html',
  styleUrl: './your-activity.component.css',
})
export class YourActivityComponent implements OnInit {
  activeSidebarItem = 'Settings';
  activeTab: ActivityTab = 'likes';
  filterWindow: FilterWindow = 'all';

  loading = false;
  actionBusy = false;
  errorMessage = '';

  likedPosts: LikedPostItem[] = [];
  comments: UserCommentActivityItem[] = [];
  archivedStories: StoryDto[] = [];
  recentlyDeletedStories: StoryDto[] = [];
  activityStoryViewerOpen = false;
  activityStoryGroups: StoryItem[] = [];
  activityStoryStartUserId: number | null = null;

  likesLoaded = false;
  commentsLoaded = false;
  archivedLoaded = false;
  deletedLoaded = false;

  editingCommentId: number | null = null;
  editingCommentText = '';

  visibleLikesCount = 10;
  visibleCommentsCount = 10;

  constructor(
    private readonly router: Router,
    private readonly authService: AuthService,
    private readonly reactionService: ReactionService,
    private readonly commentService: CommentService,
    private readonly postService: PostService,
    private readonly storyService: StoryService,
  ) {}

  ngOnInit(): void {
    this.loadTabData('likes');
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

  goToSettings(): void {
    void this.router.navigate(['/settings']);
  }

  setTab(tab: ActivityTab): void {
    this.activeTab = tab;
    this.errorMessage = '';
    this.loadTabData(tab);
  }

  setFilterWindow(windowValue: FilterWindow): void {
    this.filterWindow = windowValue;
  }

  unlikePost(item: LikedPostItem): void {
    if (this.actionBusy) {
      return;
    }

    this.actionBusy = true;
    this.reactionService.removeReaction(item.post.id, 'POST').pipe(
      finalize(() => {
        this.actionBusy = false;
      }),
    ).subscribe({
      next: () => {
        this.likedPosts = this.likedPosts.filter((existing) => existing.post.id !== item.post.id);
      },
      error: () => {
        this.errorMessage = 'Unable to unlike this post right now.';
      },
    });
  }

  beginEditComment(comment: UserCommentActivityItem): void {
    this.editingCommentId = comment.id;
    this.editingCommentText = comment.content;
  }

  cancelEditComment(): void {
    this.editingCommentId = null;
    this.editingCommentText = '';
  }

  saveEditedComment(comment: UserCommentActivityItem): void {
    const nextText = this.editingCommentText.trim();
    if (!nextText || this.actionBusy) {
      return;
    }

    this.actionBusy = true;
    this.commentService.updateComment(comment.id, nextText).pipe(
      finalize(() => {
        this.actionBusy = false;
      }),
    ).subscribe({
      next: (updated: CommentItem) => {
        this.comments = this.comments.map((item) =>
          item.id === comment.id
            ? { ...item, content: updated.content, updatedAt: updated.updatedAt }
            : item,
        );
        this.cancelEditComment();
      },
      error: () => {
        this.errorMessage = 'Unable to update this comment right now.';
      },
    });
  }

  deleteComment(comment: UserCommentActivityItem): void {
    if (this.actionBusy) {
      return;
    }

    this.actionBusy = true;
    this.commentService.deleteComment(comment.id).pipe(
      finalize(() => {
        this.actionBusy = false;
      }),
    ).subscribe({
      next: () => {
        this.comments = this.comments.filter((item) => item.id !== comment.id);
        if (this.editingCommentId === comment.id) {
          this.cancelEditComment();
        }
      },
      error: () => {
        this.errorMessage = 'Unable to delete this comment right now.';
      },
    });
  }

  restoreStory(story: StoryDto): void {
    if (this.actionBusy) {
      return;
    }

    this.actionBusy = true;
    this.storyService.restoreStory(story.storyId).pipe(
      finalize(() => {
        this.actionBusy = false;
      }),
    ).subscribe({
      next: (restored) => {
        this.recentlyDeletedStories = this.recentlyDeletedStories.filter((item) => item.storyId !== story.storyId);
        if (restored.archived) {
          this.archivedStories = [restored, ...this.archivedStories.filter((item) => item.storyId !== restored.storyId)];
        }
      },
      error: () => {
        this.errorMessage = 'Unable to restore this story right now.';
      },
    });
  }

  permanentlyDeleteStory(story: StoryDto): void {
    if (this.actionBusy) {
      return;
    }

    const confirmed = window.confirm('Permanently delete this story? This cannot be undone.');
    if (!confirmed) {
      return;
    }

    this.actionBusy = true;
    this.storyService.permanentlyDeleteStory(story.storyId).pipe(
      finalize(() => {
        this.actionBusy = false;
      }),
    ).subscribe({
      next: () => {
        this.recentlyDeletedStories = this.recentlyDeletedStories.filter((item) => item.storyId !== story.storyId);
      },
      error: () => {
        this.errorMessage = 'Unable to permanently delete this story right now.';
      },
    });
  }

  openPost(postId: number): void {
    void this.router.navigate(['/post', postId], {
      queryParams: { from: this.router.url },
    });
  }

  openStoryMedia(story: StoryDto): void {
    if (!story.mediaUrl?.trim()) {
      return;
    }

    const currentUser = this.authService.getAuthUser();
    const currentUserId = currentUser?.id ?? story.userId;
    const displayName = `${currentUser?.firstName ?? ''} ${currentUser?.lastName ?? ''}`.trim() || currentUser?.username || 'Your story';

    this.activityStoryGroups = [{
      id: `activity-story-${story.storyId}`,
      userId: currentUserId,
      name: displayName,
      username: currentUser?.username,
      avatarColor: '#4f7bff',
      avatarUrl: currentUser?.profileImageUrl,
      hasUnseen: !story.viewedByCurrentUser,
      stories: [this.toStoryMediaItem(story)],
    }];
    this.activityStoryStartUserId = currentUserId;
    this.activityStoryViewerOpen = true;
  }

  onCloseActivityStoryViewer(): void {
    this.activityStoryViewerOpen = false;
    this.activityStoryGroups = [];
    this.activityStoryStartUserId = null;
  }

  storyMediaType(story: StoryDto): 'image' | 'video' | 'none' {
    if (!story.mediaUrl || !story.mediaUrl.trim()) {
      return 'none';
    }

    const normalizedMediaType = story.mediaType?.toUpperCase();
    if (normalizedMediaType === 'VIDEO') {
      return 'video';
    }

    if (normalizedMediaType === 'IMAGE') {
      return 'image';
    }

    const normalizedUrl = story.mediaUrl.toLowerCase();
    if (normalizedUrl.endsWith('.mp4') || normalizedUrl.includes('/video/')) {
      return 'video';
    }

    return 'image';
  }

  storyPreviewLabel(story: StoryDto): string {
    const caption = story.caption?.trim();
    if (caption) {
      return caption;
    }

    return this.storyMediaType(story) === 'video' ? 'Video story' : 'Image story';
  }

  loadMoreLikes(): void {
    this.visibleLikesCount += 10;
  }

  loadMoreComments(): void {
    this.visibleCommentsCount += 10;
  }

  get filteredLikes(): LikedPostItem[] {
    return this.likedPosts
      .filter((item) => this.passesDateWindow(item.reaction.reactedAt))
      .sort((left, right) => new Date(right.reaction.reactedAt).getTime() - new Date(left.reaction.reactedAt).getTime());
  }

  get filteredComments(): UserCommentActivityItem[] {
    return this.comments.filter((item) => this.passesDateWindow(item.createdAt));
  }

  get filteredArchivedStories(): StoryDto[] {
    return this.archivedStories.filter((item) => this.passesDateWindow(item.archivedAt ?? item.updatedAt));
  }

  get filteredDeletedStories(): StoryDto[] {
    return this.recentlyDeletedStories.filter((item) => this.passesDateWindow(item.deletedAt ?? item.updatedAt));
  }

  postMediaType(post: PostItem): 'image' | 'video' | 'none' {
    if (!post.mediaUrl || !post.mediaUrl.trim()) {
      return 'none';
    }

    const normalized = post.mediaUrl.toLowerCase();
    if (normalized.endsWith('.mp4') || normalized.includes('/video/')) {
      return 'video';
    }

    return 'image';
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

  private loadTabData(tab: ActivityTab): void {
    if (tab === 'likes' && !this.likesLoaded) {
      this.fetchLikes();
      return;
    }

    if (tab === 'comments' && !this.commentsLoaded) {
      this.fetchComments();
      return;
    }

    if (tab === 'archived' && !this.archivedLoaded) {
      this.fetchArchivedStories();
      return;
    }

    if (tab === 'deleted' && !this.deletedLoaded) {
      this.fetchDeletedStories();
    }
  }

  private fetchLikes(): void {
    this.loading = true;
    this.errorMessage = '';

    this.reactionService.getMyPostReactions().pipe(
      map((reactions) => reactions.slice(0, 40)),
      switchMap((reactions) => {
        const postRequests = reactions.map((reaction) =>
          this.postService.getPostById(reaction.postId).pipe(
            map((post) => ({ post, reaction })),
            catchError(() => of(null)),
          ),
        );

        if (reactions.length === 0) {
          return of([] as LikedPostItem[]);
        }

        return forkJoin(postRequests).pipe(
          map((items) => items.filter((item): item is LikedPostItem => item != null)),
        );
      }),
      finalize(() => {
        this.loading = false;
      }),
    ).subscribe({
      next: (items) => {
        this.likedPosts = items;
        this.likesLoaded = true;
      },
      error: () => {
        this.errorMessage = 'Unable to load likes activity right now.';
      },
    });
  }

  private fetchComments(): void {
    this.loading = true;
    this.errorMessage = '';

    this.commentService.getMyComments().pipe(
      finalize(() => {
        this.loading = false;
      }),
    ).subscribe({
      next: (items) => {
        this.comments = items;
        this.commentsLoaded = true;
      },
      error: () => {
        this.errorMessage = 'Unable to load your comments right now.';
      },
    });
  }

  private fetchArchivedStories(): void {
    this.loading = true;
    this.errorMessage = '';

    this.storyService.getArchivedStories().pipe(
      finalize(() => {
        this.loading = false;
      }),
    ).subscribe({
      next: (stories) => {
        this.archivedStories = stories;
        this.archivedLoaded = true;
      },
      error: () => {
        this.errorMessage = 'Unable to load archived stories right now.';
      },
    });
  }

  private fetchDeletedStories(): void {
    this.loading = true;
    this.errorMessage = '';

    this.storyService.getRecentlyDeletedStories().pipe(
      finalize(() => {
        this.loading = false;
      }),
    ).subscribe({
      next: (stories) => {
        this.recentlyDeletedStories = stories;
        this.deletedLoaded = true;
      },
      error: () => {
        this.errorMessage = 'Unable to load recently deleted stories right now.';
      },
    });
  }

  private passesDateWindow(value: string | null | undefined): boolean {
    if (!value || this.filterWindow === 'all') {
      return true;
    }

    const eventDate = new Date(value).getTime();
    if (Number.isNaN(eventDate)) {
      return true;
    }

    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;

    if (this.filterWindow === '7d') {
      return now - eventDate <= sevenDays;
    }

    return now - eventDate <= thirtyDays;
  }
}
