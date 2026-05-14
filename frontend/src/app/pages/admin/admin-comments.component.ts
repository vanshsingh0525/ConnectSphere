import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AdminApiService } from '../../services/admin/admin-api.service';

@Component({
  selector: 'app-admin-comments',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <section class="toolbar"><input [(ngModel)]="query" placeholder="Search comments / users" /><label><input type="checkbox" [(ngModel)]="offensiveOnly" /> Offensive only</label></section>
  <section class="table-wrap"><table><thead><tr><th>User</th><th>Comment</th><th>Post</th><th>Timestamp</th><th>Actions</th></tr></thead><tbody>
    <tr *ngFor="let c of filteredComments" [class.offensive]="c.offensive">
      <td>{{ '@' + c.username }}</td>
      <td>{{ c.text }}</td>
      <td>#{{ c.postId }}</td>
      <td>{{ c.createdAt }}</td>
      <td><button (click)="openPost(c.postId)">View Post</button><button class="danger" (click)="remove(c)">Delete</button></td>
    </tr>
  </tbody></table></section>
  `,
  styles: [`
  .toolbar{display:flex;gap:.7rem;flex-wrap:wrap;margin-bottom:.8rem}.toolbar input{height:40px;min-width:260px;border-radius:12px;border:1px solid rgba(151,176,255,.32);background:rgba(14,24,50,.64);color:#e7efff;padding:0 .8rem}
  .table-wrap{overflow:auto;border:1px solid rgba(138,162,245,.24);border-radius:14px;background:rgba(13,22,47,.65)}table{width:100%;border-collapse:collapse}th,td{padding:.75rem;border-bottom:1px solid rgba(133,157,242,.14);text-align:left}
  tr.offensive td{background:rgba(251,113,133,.08)}button{height:30px;border-radius:10px;border:1px solid rgba(138,161,247,.35);background:rgba(255,255,255,.05);color:#e4ecff}.danger{border-color:rgba(251,113,133,.55);color:#fecaca}
  `],
})
export class AdminCommentsComponent implements OnInit {
  comments: Array<{ id: number; username: string; text: string; postId: number; createdAt: string; offensive: boolean }> = [];
  query = '';
  offensiveOnly = false;

  constructor(private readonly adminApi: AdminApiService) {}

  ngOnInit(): void {
    const flaggedKeywords = ['abuse', 'hate', 'toxic', 'spam'];
    this.adminApi.getComments().subscribe((rows) => {
      this.comments = rows.map((row) => {
        const text = String(row['text'] ?? row['comment'] ?? '');
        return {
          id: Number(row['id'] ?? 0),
          username: String(row['username'] ?? row['authorUsername'] ?? 'user'),
          text,
          postId: Number(row['postId'] ?? 0),
          createdAt: String(row['createdAt'] ?? '').slice(0, 19).replace('T', ' '),
          offensive: flaggedKeywords.some((keyword) => text.toLowerCase().includes(keyword)),
        };
      });
    });
  }

  get filteredComments() {
    const text = this.query.trim().toLowerCase();
    return this.comments.filter((c) => {
      const matchesText = !text || c.text.toLowerCase().includes(text) || c.username.toLowerCase().includes(text);
      const matchesOffensive = !this.offensiveOnly || c.offensive;
      return matchesText && matchesOffensive;
    });
  }

  openPost(postId: number): void { window.open(`/post/${postId}`, '_blank'); }

  remove(comment: { id: number }): void {
    this.adminApi.deleteComment(comment.id).subscribe(() => {
      this.comments = this.comments.filter((item) => item.id !== comment.id);
    });
  }
}
