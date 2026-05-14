import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AdminApiService } from '../../services/admin/admin-api.service';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <section class="toolbar">
    <input [(ngModel)]="query" placeholder="Search users" />
    <select [(ngModel)]="verifiedFilter"><option value="all">All</option><option value="verified">Verified</option><option value="unverified">Unverified</option></select>
    <select [(ngModel)]="privacyFilter"><option value="all">All Profiles</option><option value="public">Public</option><option value="private">Private</option></select>
  </section>

  <section class="table-wrap">
    <table>
      <thead><tr><th>User</th><th>Status</th><th>Followers</th><th>Following</th><th>Actions</th></tr></thead>
      <tbody>
        <tr *ngFor="let user of pagedUsers">
          <td><strong>{{ '@' + user.username }}</strong><span class="badge" *ngIf="user.verified">V</span><p>{{ user.name }}</p></td>
          <td><span class="chip" [class.suspended]="user.status==='SUSPENDED'">{{ user.status }}</span></td>
          <td>{{ user.followers }}</td><td>{{ user.following }}</td>
          <td class="actions">
            <button (click)="openProfile(user.username)">View</button>
            <button (click)="toggleStatus(user)">{{ user.status === 'SUSPENDED' ? 'Activate' : 'Suspend' }}</button>
            <button class="danger" (click)="removeUser(user)">Delete</button>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
  <div class="pager"><button (click)="prev()" [disabled]="page===1">Prev</button><span>Page {{ page }} / {{ totalPages }}</span><button (click)="next()" [disabled]="page===totalPages">Next</button></div>
  `,
  styles: [`
  .toolbar{display:flex;gap:.6rem;flex-wrap:wrap;margin-bottom:.8rem}.toolbar input,.toolbar select{height:40px;border-radius:12px;border:1px solid rgba(153,177,255,.3);background:rgba(15,24,50,.65);color:#e7eeff;padding:0 .7rem}
  .table-wrap{overflow:auto;border:1px solid rgba(132,158,248,.25);border-radius:14px;background:rgba(13,22,47,.62)}
  table{width:100%;border-collapse:collapse}th,td{padding:.8rem;border-bottom:1px solid rgba(137,161,245,.15);text-align:left}th{color:#bcd1ff;font-size:.82rem}
  .badge{margin-left:.4rem;color:#7dd3fc}.chip{padding:.15rem .5rem;border-radius:999px;border:1px solid rgba(110,231,183,.45);color:#a7f3d0}.chip.suspended{border-color:rgba(251,113,133,.5);color:#fecdd3}
  .actions{display:flex;gap:.35rem;flex-wrap:wrap}.actions button{border:1px solid rgba(145,170,255,.35);background:rgba(255,255,255,.05);color:#dbe7ff;border-radius:10px;height:32px;padding:0 .55rem}.actions .danger{border-color:rgba(251,113,133,.55);color:#fecaca}
  .pager{display:flex;justify-content:flex-end;align-items:center;gap:.6rem;margin-top:.65rem}.pager button{height:32px;border-radius:10px}
  p{margin:.15rem 0 0;color:#98addc;font-size:.8rem}
  `],
})
export class AdminUsersComponent implements OnInit {
  users: Array<{ id: number; username: string; name: string; verified: boolean; isPublic: boolean; followers: number; following: number; status: string }> = [];
  query = '';
  verifiedFilter: 'all' | 'verified' | 'unverified' = 'all';
  privacyFilter: 'all' | 'public' | 'private' = 'all';
  page = 1;
  pageSize = 8;

  constructor(private readonly adminApi: AdminApiService) {}

  ngOnInit(): void {
    this.adminApi.getUsers().subscribe((rows) => {
      this.users = rows.map((row) => ({
        id: Number(row['id'] ?? row['userId'] ?? 0),
        username: String(row['username'] ?? ''),
        name: String(row['name'] ?? `${row['firstName'] ?? ''} ${row['lastName'] ?? ''}`).trim(),
        verified: Boolean(row['verified']),
        isPublic: Boolean(row['isPublic'] ?? true),
        followers: Number(row['followers'] ?? 0),
        following: Number(row['following'] ?? 0),
        status: String(row['status'] ?? 'ACTIVE').toUpperCase(),
      }));
    });
  }

  get filteredUsers() {
    const text = this.query.trim().toLowerCase();
    return this.users.filter((u) => {
      const matchesText = !text || u.username.toLowerCase().includes(text) || u.name.toLowerCase().includes(text);
      const matchesVerified = this.verifiedFilter === 'all' || (this.verifiedFilter === 'verified' ? u.verified : !u.verified);
      const matchesPrivacy = this.privacyFilter === 'all' || (this.privacyFilter === 'public' ? u.isPublic : !u.isPublic);
      return matchesText && matchesVerified && matchesPrivacy;
    });
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredUsers.length / this.pageSize));
  }

  get pagedUsers() {
    const safePage = Math.min(this.page, this.totalPages);
    const start = (safePage - 1) * this.pageSize;
    return this.filteredUsers.slice(start, start + this.pageSize);
  }

  prev(): void { this.page = Math.max(1, this.page - 1); }
  next(): void { this.page = Math.min(this.totalPages, this.page + 1); }

  openProfile(username: string): void { window.open(`/profile/${username}`, '_blank'); }

  toggleStatus(user: { id: number; status: string }): void {
    const nextStatus = user.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    this.adminApi.updateUserStatus(user.id, nextStatus).subscribe(() => { user.status = nextStatus; });
  }

  removeUser(user: { id: number }): void {
    this.adminApi.deleteUser(user.id).subscribe(() => {
      this.users = this.users.filter((item) => item.id !== user.id);
    });
  }
}
