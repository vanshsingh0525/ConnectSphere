import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';

import { AdminApiService } from '../../services/admin/admin-api.service';

@Component({
  selector: 'app-admin-moderation',
  standalone: true,
  imports: [CommonModule],
  template: `
  <section class="queue-grid">
    <article class="queue-card" *ngFor="let item of queue">
      <header><strong>{{ item.type }}</strong><span>{{ item.id }}</span></header>
      <p>{{ item.text }}</p>
      <div class="actions">
        <button (click)="mark(item, 'APPROVED')">Approve</button>
        <button (click)="mark(item, 'REVIEW_LATER')">Review Later</button>
        <button class="danger" (click)="mark(item, 'REMOVED')">Remove</button>
      </div>
    </article>
  </section>
  `,
  styles: [`
  .queue-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:.85rem}.queue-card{padding:.9rem;border-radius:14px;border:1px solid rgba(141,166,253,.26);background:rgba(16,25,53,.64)}
  header{display:flex;justify-content:space-between;color:#bdd0ff}p{color:#e3ebff;min-height:40px}.actions{display:flex;gap:.4rem;flex-wrap:wrap}
  button{height:32px;border-radius:10px;border:1px solid rgba(147,173,255,.35);background:rgba(255,255,255,.05);color:#e3ecff}.danger{border-color:rgba(251,113,133,.55);color:#fecaca}
  `],
})
export class AdminModerationComponent implements OnInit {
  queue: Array<{ id: number; type: string; text: string; action?: string }> = [];

  constructor(private readonly adminApi: AdminApiService) {}

  ngOnInit(): void {
    this.adminApi.getFlaggedPosts().subscribe((rows) => {
      const posts = rows.map((row) => ({
        id: Number(row['id'] ?? 0),
        type: 'FLAGGED_POST',
        text: String(row['text'] ?? row['caption'] ?? 'Flagged post requires moderation'),
      }));
      this.queue = posts;
    });

    this.adminApi.getComments().subscribe((rows) => {
      const suspicious = rows
        .filter((row) => {
          const text = String(row['text'] ?? '').toLowerCase();
          return text.includes('spam') || text.includes('abuse') || text.includes('toxic');
        })
        .slice(0, 10)
        .map((row) => ({
          id: Number(row['id'] ?? 0),
          type: 'SUSPICIOUS_COMMENT',
          text: String(row['text'] ?? 'Comment flagged by moderation AI'),
        }));
      this.queue = [...this.queue, ...suspicious];
    });
  }

  mark(item: { action?: string }, action: string): void {
    item.action = action;
  }
}
