import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, HostListener, Input, Output } from '@angular/core';

import { ImageFallbackDirective } from '../../directives/image-fallback.directive';
import { StoryItem } from '../../models/dashboard-ui.model';

@Component({
  selector: 'app-stories',
  standalone: true,
  imports: [CommonModule, ImageFallbackDirective],
  templateUrl: './stories.component.html',
  styleUrl: './stories.component.css',
})
export class StoriesComponent {
  @Input() stories: StoryItem[] = [];
  @Output() addStory = new EventEmitter<void>();
  @Output() storySelected = new EventEmitter<StoryItem>();

  constructor(private readonly host: ElementRef<HTMLElement>) {}

  get visibleStories(): StoryItem[] {
    if (this.stories.length > 0) {
      return this.stories;
    }

    return [{ id: 'add-story', name: 'Your story', avatarColor: '#8aa3d9', isAddStory: true }];
  }

  onStoryClick(story: StoryItem): void {
    if (story.isAddStory) {
      this.addStory.emit();
      return;
    }

    if ((story.stories?.length ?? 0) > 0) {
      this.storySelected.emit(story);
    }
  }

  @HostListener('wheel', ['$event'])
  onWheel(event: WheelEvent): void {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
      return;
    }

    const feedArea = this.host.nativeElement.closest('.feed-area') as HTMLElement | null;
    if (!feedArea) {
      return;
    }

    const canScrollInternally = feedArea.scrollHeight > feedArea.clientHeight;
    if (!canScrollInternally) {
      return;
    }

    event.preventDefault();
    feedArea.scrollTop += event.deltaY;
  }
}
