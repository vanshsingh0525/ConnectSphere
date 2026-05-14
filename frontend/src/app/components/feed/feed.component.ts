import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';

import { FeedPostItem, StoryItem } from '../../models/dashboard-ui.model';
import { PostCardComponent } from '../post-card/post-card.component';
import { StoriesComponent } from '../stories/stories.component';

@Component({
  selector: 'app-feed',
  standalone: true,
  imports: [CommonModule, StoriesComponent, PostCardComponent],
  templateUrl: './feed.component.html',
  styleUrl: './feed.component.css',
})
export class FeedComponent implements OnChanges {
  @Input() stories: StoryItem[] = [];
  @Input() posts: FeedPostItem[] = [];
  @Output() userSelected = new EventEmitter<string>();
  @Output() addStory = new EventEmitter<void>();
  @Output() storySelected = new EventEmitter<StoryItem>();
  @Output() editRequested = new EventEmitter<number>();

  visiblePosts: FeedPostItem[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['posts']) {
      this.visiblePosts = [...this.posts];
    }
  }

  onFeedScroll(event: Event): void {
    // Scroll ownership is handled by the parent feed container.
  }

  trackByPostId(index: number, post: FeedPostItem): number {
    return post.id;
  }

  onUserSelected(username: string): void {
    this.userSelected.emit(username);
  }

  onAddStory(): void {
    this.addStory.emit();
  }

  onStorySelected(story: StoryItem): void {
    this.storySelected.emit(story);
  }

  onEditRequested(postId: number): void {
    this.editRequested.emit(postId);
  }
}
