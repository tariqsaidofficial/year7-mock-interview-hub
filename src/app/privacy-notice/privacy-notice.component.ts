import {
  AfterViewInit,
  Component,
  ElementRef,
  input,
  OnDestroy,
  ViewChild,
  output,
} from '@angular/core';
import { UiIconComponent } from '../ui-icon.component';

/**
 * A single-use, accessible notice for the Step 1 setup page.
 * The parent decides when it mounts this component (1500ms after entering setup).
 * No agreement/consent data is collected or persisted by this component.
 */
@Component({
  selector: 'app-privacy-notice',
  standalone: true,
  imports: [UiIconComponent],
  templateUrl: './privacy-notice.component.html',
  styleUrl: './privacy-notice.component.css',
})
export class PrivacyNoticeComponent implements AfterViewInit, OnDestroy {
  readonly demo = input(false);
  @ViewChild('privacyDialog', { static: true })
  private readonly privacyDialog!: ElementRef<HTMLDialogElement>;

  readonly dismissed = output<void>();
  private didNotify = false;
  private returnFocus: HTMLElement | null = null;

  ngAfterViewInit(): void {
    this.returnFocus = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    this.privacyDialog.nativeElement.showModal();
  }

  dismiss(): void {
    if (this.privacyDialog.nativeElement.open) {
      this.privacyDialog.nativeElement.close();
    }
    this.onDialogClosed();
  }

  onCancel(event: Event): void { event.preventDefault(); this.dismiss(); }

  onDialogClosed(): void {
    if (this.didNotify) return;
    this.didNotify = true;
    this.dismissed.emit();
    queueMicrotask(() => {
      if (this.returnFocus?.isConnected) this.returnFocus.focus();
      else document.getElementById('first-name')?.focus();
    });
  }

  ngOnDestroy(): void {
    this.didNotify = true;
    if (this.privacyDialog?.nativeElement.open) {
      this.privacyDialog.nativeElement.close();
    }
  }
}
