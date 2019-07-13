import {ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild} from '@angular/core';
import {ArtistDataService} from '@app/services/artist-data.service';
import {BehaviorSubject, Subject} from 'rxjs';
import {throttleIndicator} from '@app/utils/component-utils';
import {takeUntil} from 'rxjs/operators';
import {bound, countOccurrences, scrollToView} from '@common/util/misc-utils';
import {SongDetails} from '@common/artist-model';
import {ToastService} from '@app/toast/toast.service';

/** Embeddable song editor component. */
@Component({
  selector: 'gt-song-editor',
  templateUrl: './song-editor.component.html',
  styleUrls: ['./song-editor.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SongEditorComponent implements OnInit, OnDestroy {

  /** Id of the edited song.*/
  @Input() songId!: number;

  /** If true, component will trigger scrolling edit area into the view. */
  @Input() scrollIntoView = false;

  /** Emitted when panel wants to be closed. */
  @Output() closeRequest = new EventEmitter();

  readonly destroyed$ = new Subject();

  loaded = false;
  readonly indicatorIsAllowed$ = new BehaviorSubject(false);
  content = '';
  mediaLinks = '';
  details?: SongDetails;

  @ViewChild('contentBlock', {static: false, read: ElementRef}) private contentRef?: ElementRef;

  constructor(private readonly ads: ArtistDataService,
              private readonly toastService: ToastService
  ) {
  }

  ngOnInit(): void {
    throttleIndicator(this);
    this.ads.getSongDetailsById(this.songId)
        .pipe(takeUntil(this.destroyed$))
        .subscribe(details => {
          this.details = details;
          this.content = details ? details.content : '?';
          this.mediaLinks = details ? details.mediaLinks.join(' ') : '';
          this.loaded = true;
          if (this.scrollIntoView) {
            setTimeout(() => scrollToView(this.contentRef && this.contentRef.nativeElement), 200);
          }
        });
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
  }

  async save(): Promise<void> {
    if (!this.details || (this.details.content === this.content && this.details.mediaLinks.join(' ') == this.mediaLinks)) {
      return;
    }
    try {
      await this.ads.updateSongDetails({...this.details, content: this.content, mediaLinks: this.mediaLinks.split(' ')});
      this.close();
    } catch (err) {
      this.toastService.warning(`Ошибка: ${err}`);
    }
  }

  getContentRowsCount(): number {
    return bound(8, countOccurrences(this.content, '\n'), window.innerHeight / 20 - 10); // simple heuristic that works (can be improved later if needed).
  }

  close(): void {
    this.closeRequest.emit();
  }
}