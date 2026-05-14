import { Directive, HostListener, Input } from '@angular/core';

import { DEFAULT_AVATAR_URL } from '../utils/avatar.util';

@Directive({
  selector: 'img[appImageFallback]',
  standalone: true,
})
export class ImageFallbackDirective {
  @Input() appImageFallback = DEFAULT_AVATAR_URL;

  @HostListener('error', ['$event'])
  onError(event: Event): void {
    const image = event.target as HTMLImageElement | null;
    if (!image) {
      return;
    }

    const fallback = this.appImageFallback || DEFAULT_AVATAR_URL;
    if (image.dataset['fallbackApplied'] === 'true' || image.src.endsWith(fallback)) {
      return;
    }

    image.dataset['fallbackApplied'] = 'true';
    image.src = fallback;
  }
}
