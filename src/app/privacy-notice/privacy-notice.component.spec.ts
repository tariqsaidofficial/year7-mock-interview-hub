import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrivacyNoticeComponent } from './privacy-notice.component';

describe('privacy notice', () => {
  beforeEach(() => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; this.dispatchEvent(new Event('close')); } });
  });
  afterEach(() => {
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  });

  it('opens a labelled modal with the approved factual copy and existing icons', () => {
    TestBed.configureTestingModule({ imports: [PrivacyNoticeComponent] });
    const fixture = TestBed.createComponent(PrivacyNoticeComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const dialog = root.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(dialog.getAttribute('aria-labelledby')).toBe('privacy-title');
    expect(dialog.getAttribute('aria-describedby')).toBe('privacy-description');
    expect(root.querySelectorAll('.privacy-assurance')).toHaveLength(3);
    expect(root.querySelectorAll('app-ui-icon').length).toBeGreaterThan(3);
    expect(root.textContent).toContain('first name, last name and form group');
    expect(root.textContent).toContain('Deepgram');
    expect(root.textContent).toContain('OpenRouter');
    expect(root.textContent).toContain('Firebase');
    expect(root.textContent).not.toMatch(/not used to train|never stored|never leaves school|one-time activity/i);
    fixture.destroy();
  });

  it('closes on I understand and returns focus to the opener', async () => {
    const opener = document.createElement('button');
    document.body.append(opener); opener.focus();
    TestBed.configureTestingModule({ imports: [PrivacyNoticeComponent] });
    const fixture = TestBed.createComponent(PrivacyNoticeComponent);
    const dismissed = vi.fn(); fixture.componentInstance.dismissed.subscribe(dismissed);
    fixture.detectChanges();
    const dialog = (fixture.nativeElement as HTMLElement).querySelector('dialog') as HTMLDialogElement;
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.privacy-accept')?.click();
    await Promise.resolve();
    expect(dialog.open).toBe(false);
    expect(dismissed).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(opener);
    fixture.destroy(); opener.remove();
  });

  it('handles browser Escape close once and exposes keyboard disclosure', () => {
    TestBed.configureTestingModule({ imports: [PrivacyNoticeComponent] });
    const fixture = TestBed.createComponent(PrivacyNoticeComponent);
    const dismissed = vi.fn(); fixture.componentInstance.dismissed.subscribe(dismissed);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const dialog = root.querySelector('dialog') as HTMLDialogElement;
    const summary = root.querySelector('summary') as HTMLElement;
    expect(summary.tabIndex).toBeGreaterThanOrEqual(0);
    expect(summary.closest('details')).not.toBeNull();
    const cancel = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(cancel); // Native Escape emits cancel before closing.
    expect(cancel.defaultPrevented).toBe(true);
    expect(dialog.open).toBe(false);
    expect(dismissed).toHaveBeenCalledOnce();
    dialog.dispatchEvent(new Event('close'));
    expect(dismissed).toHaveBeenCalledOnce();
    fixture.destroy();
  });
});
