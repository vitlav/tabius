import {Directive, ElementRef, EventEmitter, HostListener, Input, OnDestroy, Output, TemplateRef} from '@angular/core';
import {ChordLayout, getChordLayout} from '@app/utils/chords-layout-lib';
import {PopoverRef} from '@app/popover/popover-ref';
import {PopoverService} from '@app/popover/popover.service';
import {Chord} from '@app/utils/chords-parser-lib';

export type ChordClickInfo = { element: HTMLElement, chord: Chord }|undefined;
export type ChordClickInfoProvider = (event: MouseEvent, chord?: Chord) => ChordClickInfo;

/** Shows chord popover on host click. */
@Directive({
  selector: '[gtChordPopoverOnClick]'
})
export class ShowChordPopoverOnClickDirective implements OnDestroy {

  @Input() gtChordPopoverOnClick_getChordInfo!: ChordClickInfoProvider;

  @Input() gtChordPopoverOnClick_popoverTemplate!: TemplateRef<{}>;

  @Input() gtChordPopoverOnClick_chord?: Chord;

  @Output() gtChordPopoverOnClick_onChordLayoutChanged = new EventEmitter<ChordLayout>();

  private chordPopoverRef?: PopoverRef;
  private lastClickedChordElement?: Element;
  private popoverChordLayout?: ChordLayout;

  constructor(private readonly el: ElementRef,
              private readonly popover: PopoverService,
  ) {
  }

  @HostListener('document:click', ['$event'])
  onClick(event: MouseEvent): void {
    const chordInfo = this.gtChordPopoverOnClick_getChordInfo(event, this.gtChordPopoverOnClick_chord);
    if (!this.el || !chordInfo || !isParentOf(this.el.nativeElement as HTMLElement, chordInfo.element)) {
      this.closeChordPopover();
      return;
    }
    const {element, chord} = chordInfo;
    const isSameChordClickedTwice = element == this.lastClickedChordElement && this.chordPopoverRef !== undefined;
    this.closeChordPopover();
    if (!isSameChordClickedTwice) {
      this.lastClickedChordElement = element;
      this.popoverChordLayout = getChordLayout(chord);
      this.gtChordPopoverOnClick_onChordLayoutChanged.emit(this.popoverChordLayout);
      this.chordPopoverRef = this.popover.open(this.gtChordPopoverOnClick_popoverTemplate, element, {
        data: element.innerText,
        backdropClass: 'c-popover-backdrop',
        panelClass: 'c-popover-panel',
      });
      this.chordPopoverRef.afterClosed().subscribe(() => {
        this.chordPopoverRef = undefined;
      });
    }
  }

  @HostListener('document:keydown')
  onKeydown(): void {
    this.closeChordPopover();
  }

  private closeChordPopover(): void {
    if (this.chordPopoverRef) {
      this.chordPopoverRef.close();
      this.chordPopoverRef = undefined;
    }
  }

  ngOnDestroy(): void {
    this.closeChordPopover();
  }
}

function isParentOf(parent: HTMLElement, child: undefined|HTMLElement): child is HTMLElement {
  return !!child && parent.contains(child);
}

