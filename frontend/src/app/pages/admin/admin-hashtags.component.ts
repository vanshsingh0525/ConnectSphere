import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AdminApiService } from '../../services/admin/admin-api.service';

@Component({
  selector: 'app-admin-hashtags',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <section class="toolbar"><input [(ngModel)]="query" placeholder="Search hashtag" /><button (click)="refresh()">Search</button></section>
  <section class="tags-grid"><article *ngFor="let tag of tags; let i = index"><h3>#{{ tag.name }}</h3><p>Rank #{{ i + 1 }}</p><p>Usage: {{ tag.usage }}</p><p>Engagement: {{ tag.engagement }}</p></article></section>
  `,
  styles: [`
  .toolbar{display:flex;gap:.6rem;margin-bottom:.85rem}.toolbar input{height:40px;min-width:260px;border-radius:12px;border:1px solid rgba(154,176,252,.35);background:rgba(13,23,50,.6);color:#e7efff;padding:0 .7rem}.toolbar button{height:40px;border-radius:12px;border:1px solid rgba(143,168,255,.45);background:linear-gradient(135deg,rgba(67,108,255,.35),rgba(124,58,237,.35));color:#eff4ff}
  .tags-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:.8rem}article{padding:.9rem;border-radius:14px;border:1px solid rgba(135,159,250,.28);background:rgba(14,22,50,.62);box-shadow:0 8px 22px rgba(28,41,84,.25)}h3{margin:0;color:#8fd2ff}p{margin:.35rem 0 0;color:#bed0ff}
  `],
})
export class AdminHashtagsComponent implements OnInit {
  query = '';
  tags: Array<{ name: string; usage: number; engagement: number }> = [];

  constructor(private readonly adminApi: AdminApiService) {}

  ngOnInit(): void { this.refresh(); }

  refresh(): void {
    this.adminApi.getHashtags(this.query, 30).subscribe((rows) => {
      this.tags = rows.map((row) => ({
        name: String(row['name'] ?? row['hashtag'] ?? 'tag').replace(/^#/, ''),
        usage: Number(row['count'] ?? row['usage'] ?? row['postCount'] ?? 0),
        engagement: Number(row['engagement'] ?? row['score'] ?? 0),
      }));
    });
  }
}
