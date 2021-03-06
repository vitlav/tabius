import {ChangeDetectionStrategy, ChangeDetectorRef, Component, HostListener, Inject, Input, OnChanges, OnDestroy, OnInit, Optional, PLATFORM_ID, SimpleChanges, TemplateRef, ViewChild} from '@angular/core';
import {SongDetails} from '@common/catalog-model';
import {combineLatest, Subject} from 'rxjs';
import {takeUntil, tap} from 'rxjs/operators';
import {UserService} from '@app/services/user.service';
import {isPlatformBrowser} from '@angular/common';
import {renderChords} from '@app/utils/chords-renderer';
import {REQUEST} from '@nguniversal/express-engine/tokens';
import {getUserAgentFromRequest, isSmallScreenDevice} from '@common/util/misc-utils';
import {SSR_DESKTOP_WIDTH, SSR_MOBILE_WIDTH} from '@common/common-constants';
import {newDefaultUserDeviceSettings, newDefaultUserSongSettings, UserDeviceSettings} from '@common/user-model';
import {ChordLayout} from '@app/utils/chords-layout-lib';
import {parseChord} from '@app/utils/chords-parser';
import {ChordClickInfo} from '@app/directives/show-chord-popover-on-click.directive';

/** Heuristic used to enable multicolumn mode. */
const IDEAL_SONG_LINES_PER_COLUMN = 17; // (4 chords + 4 text lines) * 2 + 1 line between

/** Note: must be lower-case! */
const CHORDS_TAG = 'c';

export const SONG_PRINT_FONT_SIZE = 14;

export const SONG_TEXT_COMPONENT_NAME = 'gt-song-text';

/** Shows song content (text with chords) with no title and any other meta-info. */
@Component({
  selector: SONG_TEXT_COMPONENT_NAME,
  templateUrl: './song-text.component.html',
  styleUrls: ['./song-text.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SongTextComponent implements OnInit, OnChanges, OnDestroy {
  private readonly destroyed$ = new Subject();

  @Input() song!: SongDetails;
  @Input() multiColumnMode = true;
  @Input() usePrintFontSize = false;

  /** Pre-rendered raw HTML for song text with all chords wrapped with a <c></c> tag*/
  private songHtml: string = '';

  userSongStyle: { [key: string]: string; } = {};

  readonly isBrowser: boolean;

  private deviceSettings: UserDeviceSettings = newDefaultUserDeviceSettings();
  private songSettings = newDefaultUserSongSettings(0);
  h4Si?: boolean;
  private songFontSize?: number;
  private availableWidth = 0;

  private songStats?: SongStats;

  /** Used for server-side rendering only. */
  private readonly widthFromUserAgent;

  popoverChordLayout?: ChordLayout;

  @ViewChild('chordPopover', {static: true}) chordPopoverTemplate!: TemplateRef<{}>;

  constructor(private readonly cd: ChangeDetectorRef,
              private readonly uds: UserService,
              @Inject(PLATFORM_ID) platformId: string,
              @Optional() @Inject(REQUEST) private request: any,
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
    if (!this.isBrowser) {
      const userAgent = getUserAgentFromRequest(request);
      this.widthFromUserAgent = isSmallScreenDevice(userAgent) ? SSR_MOBILE_WIDTH : SSR_DESKTOP_WIDTH;
    } else {
      this.widthFromUserAgent = 0;
    }
  }

  ngOnInit(): void {
    const style$ = this.uds.getUserDeviceSettings()
        .pipe(
            tap(deviceSettings => {
              this.deviceSettings = deviceSettings;
              this.updateSongStyle();
            }));

    //TODO: replace taps with subscriptions!
    //todo: handle song text update too
    const settings$ = this.uds.getUserSongSettings(this.song.id)
        .pipe(
            tap(songSettings => {
              this.songSettings = songSettings;
              this.resetCachedSongStats(); // transposition may add extra characters that may lead to the line width update.
              this.resetSongView();
            }));

    const h4Si$ = this.uds.getH4SiFlag()
        .pipe(
            tap(h4Si => {
              this.h4Si = h4Si;
              this.resetSongView();
            }));

    combineLatest([style$, settings$, h4Si$])
        .pipe(takeUntil(this.destroyed$))
        .subscribe(() => this.cd.detectChanges());
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['usePrintFontSize']) {
      this.updateSongStyle();
    }
    this.resetCachedSongStats();
    this.updateAvailableWidth();
    this.resetSongView();
  }

  getSongHtml(): string {
    if (this.songHtml === '') {
      const {transpose} = this.songSettings;
      let songHtml = this.song && this.isBrowser
                     ? renderChords(this.song.content, {tag: CHORDS_TAG, transpose, hideChords: false, useH: this.h4Si})
                     : '';
      if (this.multiColumnMode) {
        songHtml = preserveBlocksOnColumnBreak(songHtml);
      }
      this.songHtml = songHtml;
    }
    return this.songHtml;
  }

  private resetCachedSongStats(): void {
    delete this.songStats;
  }

  private resetSongView(): void {
    this.songHtml = '';
  }

  @HostListener('window:resize', [])
  onWindowResize() {
    this.updateAvailableWidth();
  }

  private updateAvailableWidth(): void {
    if (this.multiColumnMode) {
      this.availableWidth = window.innerWidth || this.widthFromUserAgent;
    }
  }

  is2ColumnMode(): boolean {
    const {lineCount, maxLineWidth} = this.getSongStats();
    return lineCount > IDEAL_SONG_LINES_PER_COLUMN &&
        !this.is3ColumnMode() && (this.availableWidth / (1 + maxLineWidth) >= 2);
  }

  is3ColumnMode(): boolean {
    const {lineCount, maxLineWidth} = this.getSongStats();
    return lineCount > 2 * IDEAL_SONG_LINES_PER_COLUMN &&
        !this.is4ColumnMode() && (this.availableWidth / (1 + maxLineWidth) >= 3);
  }

  is4ColumnMode(): boolean {
    const {lineCount, maxLineWidth} = this.getSongStats();
    return lineCount > 3 * IDEAL_SONG_LINES_PER_COLUMN &&
        (this.availableWidth / (1 + maxLineWidth) >= 4);
  }

  private getSongStats(): SongStats {
    if (!this.songStats) {
      this.songStats = {lineCount: 1, maxLineWidth: 0}; // line count starts with 1 because even empty string ('') is counted as 1 line.
      let maxCharsPerLine = 0;
      const {content} = this.song;
      for (let i = 0; i < content.length;) {
        const lineSepIdx = content.indexOf('\n', i);
        if (lineSepIdx === -1) {
          break;
        }
        maxCharsPerLine = Math.max(maxCharsPerLine, lineSepIdx - 1 - i);
        i = lineSepIdx + 1;
        this.songStats.lineCount++;
      }
      // trivial heuristic for song width.
      const songFontSize = this.usePrintFontSize ? SONG_PRINT_FONT_SIZE : this.songFontSize;
      this.songStats.maxLineWidth = (maxCharsPerLine + 1) * (songFontSize ? songFontSize : 16) * 2 / 3;
    }
    return this.songStats;
  }

  private updateSongStyle(): void {
    if (this.usePrintFontSize) {
      this.songFontSize = SONG_PRINT_FONT_SIZE;
    } else {
      this.songFontSize = this.deviceSettings.songFontSize;
    }
    this.userSongStyle['fontSize'] = `${this.songFontSize}px`;
    this.resetCachedSongStats();
  }

  getChordInfo(event: MouseEvent): ChordClickInfo {
    const element = event.target as HTMLElement|undefined;
    if (!element) {
      return undefined;
    }
    if (element.tagName.toLowerCase() !== CHORDS_TAG) {
      return undefined;
    }
    const chordLocation = parseChord(element.innerText);
    return chordLocation ? {element, chord: chordLocation.chord} : undefined;
  }
}

interface SongStats {
  /** Number of lines (with chord lines) in the song .*/
  lineCount: number;
  /** Heuristic based maximum song line width in pixels. */
  maxLineWidth: number;
}

const NON_BREAKING_TAG_START = '<div style="break-inside: avoid-column;">';
const NON_BREAKING_TAG_END = '</div>';

/**
 * Wraps blocks of text separated with multiple line breaks
 * with 'break-inside: avoid-column' css style.
 */
function preserveBlocksOnColumnBreak(songHtml: string): string {
  const blocks = songHtml.replace(/[^\S\n]+$/gm, '').split('\n\n');
  let blockIsOpen = false;
  let songHtmlWithBlocks = '';
  for (const block of blocks) {
    if (blockIsOpen) {
      songHtmlWithBlocks += '</div>';
      blockIsOpen = false;
    }
    const linesCountInBlock = (block.match(/\n/g) || '').length;
    const makeBlockNonBreaking = linesCountInBlock <= 12; // Keep blocks up to 6 lines (6 text + 6 chords).
    if (makeBlockNonBreaking) {
      songHtmlWithBlocks += NON_BREAKING_TAG_START;
      songHtmlWithBlocks += preserveBlockOnColumnBreak(block);
      blockIsOpen = true;
    } else {
      songHtmlWithBlocks += preserveBlockOnColumnBreak(block);
    }
    if (songHtmlWithBlocks.endsWith(NON_BREAKING_TAG_END)) {
      songHtmlWithBlocks += '\n'; // already ends with line end.
    } else {
      songHtmlWithBlocks += '\n\n';
    }
  }
  if (blockIsOpen) {
    songHtmlWithBlocks += NON_BREAKING_TAG_END;
  }
  return songHtmlWithBlocks;
}

/** Wrap pairs of lines (chords + non-chords) into non-breaking block. */
function preserveBlockOnColumnBreak(blockHtml: string): string {
  const hasChords = (line: string) => line.includes(`<${CHORDS_TAG}>`);
  const lines = blockHtml.split('\n');
  let resultHtml = '';
  for (let i = 0; i < lines.length; i++) {
    if (i + 1 < lines.length) {
      const line1 = lines[i];
      const line2 = lines[i + 1];
      if (hasChords(line1) && !hasChords(line2)) {
        resultHtml += NON_BREAKING_TAG_START + line1 + '\n' + line2 + NON_BREAKING_TAG_END;
        i++;
        continue;
      }
    }
    resultHtml += lines[i] + (i === lines.length - 1 ? '' : '\n');
  }
  return resultHtml;
}
