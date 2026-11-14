import { Component, Input } from '@angular/core';
import {
  LucideActivity, LucideArrowLeft, LucideArrowLeftRight, LucideArrowRight,
  LucideBookOpen, LucideClock3, LucideCopy, LucideDynamicIcon,
  LucideHeadphones, LucideHouse, LucideInfo, LucideLightbulb,
  LucideList, LucideMessageCircle, LucideMic, LucideRefreshCw, LucideRotateCcw,
  LucideShield, LucideShieldCheck, LucideSparkles, LucideSquare,
  LucideUserRound, LucideVolume2,
} from '@lucide/angular';

const ICONS = {
  school: LucideHouse.icon,
  transition: LucideArrowLeftRight.icon,
  book: LucideBookOpen.icon,
  activity: LucideActivity.icon,
  leadership: LucideShieldCheck.icon,
  headset: LucideHeadphones.icon,
  mic: LucideMic.icon,
  stop: LucideSquare.icon,
  volume: LucideVolume2.icon,
  replay: LucideRotateCcw.icon,
  clock: LucideClock3.icon,
  list: LucideList.icon,
  lightbulb: LucideLightbulb.icon,
  arrow: LucideArrowRight.icon,
  back: LucideArrowLeft.icon,
  copy: LucideCopy.icon,
  sparkles: LucideSparkles.icon,
  shield: LucideShield.icon,
  info: LucideInfo.icon,
  user: LucideUserRound.icon,
  refresh: LucideRefreshCw.icon,
  message: LucideMessageCircle.icon,
} as const;

export type IconName = keyof typeof ICONS;

@Component({
  selector: 'app-ui-icon',
  standalone: true,
  imports: [LucideDynamicIcon],
  template: '<svg [lucideIcon]="icons[name]" class="ui-icon" aria-hidden="true" />',
  styles: [':host{display:inline-flex;vertical-align:middle}.ui-icon{width:1.25rem;height:1.25rem;flex:none;stroke-width:1.9}'],
})
export class UiIconComponent {
  @Input({ required: true }) name!: IconName;
  readonly icons = ICONS;
}
