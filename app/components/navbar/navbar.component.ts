import {ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit} from '@angular/core';
import {User} from '@common/user-model';
import {takeUntil} from 'rxjs/operators';
import {Observable, Subject} from 'rxjs';
import {Router} from '@angular/router';
import {LINK_CATALOG, LINK_SETTINGS, LINK_STUDIO, LINK_TUNER, MOUNT_COLLECTION_PREFIX, MOUNT_SONG_PREFIX} from '@common/mounts';
import {UserService} from '@app/services/user.service';
import {ToastService} from '@app/toast/toast.service';
import {RoutingNavigationHelper} from '@app/services/routing-navigation-helper.service';
import {NODE_BB_URL} from '@app/app-constants';
import {I18N} from '@app/app-i18n';
import {USER_COLLECTION_MOUNT_SEPARATOR} from '@common/common-constants';
import {ContextMenuAction, ContextMenuActionService} from '@app/services/context-menu-action.service';
import {BrowserStateService} from '@app/services/browser-state.service';

enum NavSection {
  Home = 1,
  Forum = 2,
  Catalog = 3,
  Studio = 4,
  Tuner = 5,
  Settings = 6
}

@Component({
  selector: 'gt-navbar',
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavbarComponent implements OnInit, OnDestroy {

  private readonly destroyed$ = new Subject();

  user?: User;

  readonly forumLink = NODE_BB_URL;
  readonly catalogLink = LINK_CATALOG;
  readonly studioLink = LINK_STUDIO;
  readonly tunerLink = LINK_TUNER;
  readonly settingsLink = LINK_SETTINGS;

  readonly NavSection = NavSection;
  readonly i18n = I18N.navbar;

  /** Extra action used in mobile mode only. */
  contextMenuAction?: ContextMenuAction;

  readonly noSleepMode$: Observable<boolean>;

  constructor(private readonly uds: UserService,
              private readonly router: Router,
              private readonly toast: ToastService,
              private readonly navHelper: RoutingNavigationHelper,
              private readonly cd: ChangeDetectorRef,
              private readonly bss: BrowserStateService,
              contextMenuActionService: ContextMenuActionService,
  ) {
    this.noSleepMode$ = bss.getNoSleepMode$();
    contextMenuActionService.navbarAction$.pipe(takeUntil(this.destroyed$)).subscribe(action => {
      this.contextMenuAction = action;
    });
  }

  ngOnInit() {
    this.uds.getUser()
        .pipe(takeUntil(this.destroyed$))
        .subscribe(user => {
          this.user = user;
          this.cd.detectChanges();
        });

    this.router.events
        .pipe(takeUntil(this.destroyed$))
        .subscribe(() => {
          this.cd.markForCheck();
        });

  }

  ngOnDestroy(): void {
    this.destroyed$.next();
  }

  //todo: make an utility in routing module.
  getActiveSection(): NavSection {
    const url = this.router.url.toLocaleLowerCase();
    if (url.startsWith(LINK_TUNER)) {
      return NavSection.Tuner;
    } else if (url.startsWith(LINK_CATALOG) || url.startsWith(`/${MOUNT_COLLECTION_PREFIX}`) || url.startsWith(`/${MOUNT_SONG_PREFIX}`)) {
      if (url.includes(USER_COLLECTION_MOUNT_SEPARATOR)) {
        return NavSection.Studio;
      }
      return NavSection.Catalog;
    } else if (url.startsWith(LINK_STUDIO)) {
      return NavSection.Studio;
    } else if (url.startsWith(LINK_SETTINGS)) {
      return NavSection.Settings;
    }
    return NavSection.Home;
  }

  getUserIconText(): string {
    const {user} = this;
    if (!user) {
      return '-';
    }
    return user.username && user.username.length > 0 ? user.username.charAt(0).toUpperCase() : '+';
  }

  showUserInfo(): void {
    if (this.user) {
      this.toast.info(this.i18n.accountInfoToast(this.user));
    } else {
      this.toast.info(this.i18n.accountInfoNotLoggedInToast);
    }
  }

  resetCollectionPageScroll(): void {
    this.navHelper.resetSavedScrollPosition(this.catalogLink);
    if (this.router.url === this.catalogLink) {
      window.scroll({top: 0, left: 0, behavior: 'smooth'});
    }
  }

  toggleNoSleep(): void {
    this.bss.toggleNoSleepMode();
  }

  activateContextMenuAction(): void {
    if (this.contextMenuAction) {
      this.contextMenuAction.activate();
    }
  }
}
