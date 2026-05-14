import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

import { HighlightItem } from '../../models/profile-ui.model';

@Component({
  selector: 'app-highlights',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './highlights.component.html',
  styleUrl: './highlights.component.css',
})
export class HighlightsComponent {
  @Input() items: HighlightItem[] = [];
  @Input() isOwnProfile = false;
  @Output() addRequested = new EventEmitter<void>();
  @Output() highlightSelected = new EventEmitter<HighlightItem>();
  @Output() editRequested = new EventEmitter<HighlightItem>();
  @Output() deleteRequested = new EventEmitter<HighlightItem>();

  onHighlightClick(item: HighlightItem): void {
    if (item.isNew) {
      this.addRequested.emit();
      return;
    }

    this.highlightSelected.emit(item);
  }
}
