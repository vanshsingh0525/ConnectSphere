import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AdminApiService } from '../../services/admin/admin-api.service';

@Component({
  selector: 'app-admin-posts',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <section class="toolbar"><input [(ngModel)]="query" placeholder="Search posts or usernames" /><label><input type="checkbox" [(ngModel)]="onlyReported" /> Reported only</label></section>
  <section class="post-grid">
    <article class="post-card" *ngFor="let post of filteredPosts">
      <header><strong>{{ '@' + post.username }}</strong><span class="chip">{{ post.visibility }}</span></header>
      <p>{{ post.caption }}</p>
      <img *ngIf="post.mediaUrl" [src]="post.mediaUrl" alt="post media" />
      <footer>
        <span>Likes {{ post.likes }} | Comments {{ post.comments }}</span>
        <span class="report" *ngIf="post.reportCount>0">Reports {{ post.reportCount }}</span>
      </footer>
      <div class="actions"><button (click)="view(post)">View</button><button (click)="moderate(post)">{{ post.flagged ? 'Unflag' : 'Flag' }}</button><button class="danger" (click)="remove(post)">Remove</button></div>
    </article>
  </section>
  `,
  styles: [`
  .toolbar{display:flex;gap:.7rem;flex-wrap:wrap;margin-bottom:.8rem}.toolbar input{height:40px;min-width:250px;border-radius:12px;border:1px solid rgba(143,165,255,.3);background:rgba(16,25,51,.65);color:#eff4ff;padding:0 .8rem}
  .post-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:.9rem}.post-card{padding:.85rem;border-radius:14px;border:1px solid rgba(146,170,255,.25);background:rgba(16,25,52,.62);transition:transform .2s}.post-card:hover{transform:translateY(-2px)}
  header{display:flex;justify-content:space-between}.chip{font-size:.72rem;color:#cfe0ff}p{color:#d8e4ff;min-height:42px}
  img{width:100%;height:150px;object-fit:cover;border-radius:10px;border:1px solid rgba(160,184,255,.3)}footer{display:flex;justify-content:space-between;color:#a8bde8;font-size:.82rem;margin-top:.55rem}
  .actions{margin-top:.65rem;display:flex;gap:.4rem}.actions button{height:32px;border-radius:10px;border:1px solid rgba(149,173,255,.35);background:rgba(255,255,255,.05);color:#e3ecff}.danger{border-color:rgba(251,113,133,.55);color:#fecaca}
  `],
})
export class AdminPostsComponent implements OnInit {
  posts: Array<{ id: number; username: string; caption: string; mediaUrl: string; likes: number; comments: number; visibility: string; reportCount: number; flagged: boolean }> = [];
  query = '';
  onlyReported = false;

  constructor(private readonly adminApi: AdminApiService) {}

  ngOnInit(): void {
    this.adminApi.getPosts().subscribe((rows) => {
      this.posts = rows.map((row) => ({
        id: Number(row['id'] ?? 0),
        username: String(row['authorUsername'] ?? row['username'] ?? 'user'),
        caption: String(row['text'] ?? row['caption'] ?? ''),
        mediaUrl: String(row['mediaUrl'] ?? ''),
        likes: Number(row['likesCount'] ?? 0),
        comments: Number(row['commentsCount'] ?? 0),
        visibility: String(row['visibility'] ?? (Boolean(row['public']) ? 'PUBLIC' : 'PRIVATE')).toUpperCase(),
        reportCount: Number(row['reportCount'] ?? 0),
        flagged: Boolean(row['flagged'] ?? row['isFlagged'] ?? false),
      }));
    });
  }

  get filteredPosts() {
    const text = this.query.trim().toLowerCase();
    return this.posts.filter((p) => {
      const matchesText = !text || p.username.toLowerCase().includes(text) || p.caption.toLowerCase().includes(text);
      const matchesReported = !this.onlyReported || p.reportCount > 0;
      return matchesText && matchesReported;
    });
  }

  view(post: { id: number }): void { window.open(`/post/${post.id}`, '_blank'); }

  moderate(post: { id: number; flagged: boolean }): void {
    this.adminApi.flagPost(post.id, !post.flagged).subscribe(() => {
      post.flagged = !post.flagged;
    });
  }

  remove(post: { id: number }): void {
    this.adminApi.deletePost(post.id).subscribe(() => {
      this.posts = this.posts.filter((item) => item.id !== post.id);
    });
  }
}
