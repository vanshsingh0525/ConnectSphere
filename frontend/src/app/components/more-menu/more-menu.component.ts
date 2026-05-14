import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-more-menu',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './more-menu.component.html',
  styleUrl: './more-menu.component.css',
})
export class MoreMenuComponent {
  @Input() top = 0;
  @Input() left = 0;
  @Input() showAdminOption = false;

  @Output() readonly admin = new EventEmitter<void>();
  @Output() readonly settings = new EventEmitter<void>();
  @Output() readonly logout = new EventEmitter<void>();
}
