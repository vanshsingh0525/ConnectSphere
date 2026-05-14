import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-verified-badge',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './verified-badge.component.html',
  styleUrl: './verified-badge.component.css',
})
export class VerifiedBadgeComponent {
  @Input() show = false;
}
