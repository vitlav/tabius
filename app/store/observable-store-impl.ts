import {Observable, of, ReplaySubject} from 'rxjs';
import {KV, StoreAdapter} from '@app/store/store-adapter';
import {makeStateKey, TransferState} from '@angular/platform-browser';
import {fromPromise} from 'rxjs/internal-compatibility';
import {catchError, shareReplay, switchMap, take, tap} from 'rxjs/operators';
import {FetchFn, NeedUpdateFn, ObservableStore, RefreshMode, skipUpdateCheck} from '@app/store/observable-store';

const SERVER_STATE_TIMESTAMP_KEY = 'server-state-timestamp';

/** Low level key->value storage. */
export class ObservableStoreImpl implements ObservableStore {
  private markAsInitialized!: () => void;
  readonly initialized$$ = new Promise<void>(resolve => this.markAsInitialized = resolve);

  private readonly dataMap = new Map<string, ReplaySubject<any>>();
  /** Set of refreshed during current session ids. */
  private readonly refreshSet = new Set<string>();
  private readonly storeAdapter$$: Promise<StoreAdapter>;

  /** Queue to make 'set' opts sequential (synchronized).*/
  readonly setOpsQueue = new Map<string, SetOp<any>[]>();
  readonly inFlightFetchOps = new Map<string, FetchOp<unknown>>();
  readonly inFlightInitRxOps = new Map<string, InitOp>();

  constructor(storeName: string,
              browser: boolean,
              adapterFactory: (name: string, browser: boolean) => StoreAdapter,
              serverState?: TransferState,
              schemaVersion?: number,
              private readonly freezeFn = noFreeze) {
    this.storeAdapter$$ = new Promise<StoreAdapter>(resolve => {
      const adapter = adapterFactory(storeName, browser);
      const t0 = Date.now();
      adapter.init(schemaVersion || 0).then(() => {
        if (!serverState) {
          resolve(adapter);
          this.markAsInitialized();
          return;
        }
        const serverStateKey = makeStateKey(`db-${storeName}`);
        if (browser) {
          const serverStateValue = serverState.get(serverStateKey, {});
          this.updateDbStateFromServerState(adapter, serverStateValue).then(() => {
            console.debug(`[${storeName}] store init time: ${Date.now() - t0}ms`);
            resolve(adapter);
            this.markAsInitialized();
          });
        } else {
          serverState.onSerialize(serverStateKey, () => {
            const kvPairs = adapter.snapshot();
            kvPairs.push({key: SERVER_STATE_TIMESTAMP_KEY, value: new Date().toUTCString()});
            return pairsToObject(kvPairs);
          });
          resolve(adapter);
          this.markAsInitialized();
        }
      });
    });
  }

  get<T>(key: string|undefined,
         fetchFn: FetchFn<T>|undefined,
         refreshMode: RefreshMode,
         needUpdateFn: NeedUpdateFn<T>,
  ): Observable<T|undefined> {
    if (!key) {
      return of(undefined);
    }
    let rs$ = this.dataMap.get(key) as ReplaySubject<T|undefined>;
    if (rs$) {
      return this.refreshRxStreamIfNeeded(rs$, key, fetchFn, refreshMode, needUpdateFn);
    }
    // Create new replay subject for the key and run initialization code for it.
    rs$ = this.registerNewRxStreamForKey<T>(key);
    return fromPromise(this.initializeRxStream(rs$, key, fetchFn, refreshMode, needUpdateFn))
        .pipe(switchMap(() => rs$));
  }

  private async initializeRxStream<T>(rs$: ReplaySubject<T|undefined>, key: string, fetchFn: FetchFn<T>|undefined, refreshMode: RefreshMode, needUpdateFn: NeedUpdateFn<T>): Promise<void> {
    // First get op. First create a blocking promise for concurrent first gets.
    let firstGetResolveFn: (() => void)|undefined = undefined;
    const firstGetOp: InitOp = {
      promise: new Promise<void>(resolve => firstGetResolveFn = resolve)
    };
    try {
      this.inFlightInitRxOps.set(key, firstGetOp);

      const store = await this.storeAdapter$$;
      const valueFromStore = await store.get<T>(key);
      if (valueFromStore) { // emit the value from store and check if refresh is needed.
        rs$.next(this.freezeFn(valueFromStore));
        this.runAsyncRefresh(key, fetchFn, refreshMode, needUpdateFn);
      } else { // there is no value in the store -> fetch initial value.
        const valueFromFetch = fetchFn ? await this.doFetch(fetchFn, key) : undefined;
        await this.set(key, valueFromFetch, needUpdateFn);
      }
    } finally {
      firstGetResolveFn!();
      this.inFlightInitRxOps.delete(key);
    }
  }

  private refreshRxStreamIfNeeded<T>(rs$: Observable<T|undefined>,
                                     key: string,
                                     fetchFn: FetchFn<T>|undefined,
                                     refreshMode: RefreshMode,
                                     needUpdateFn: NeedUpdateFn<T>): Observable<T|undefined> {
    const initOp = this.inFlightInitRxOps.get(key);
    const initOp$: Observable<unknown> = initOp ? fromPromise(initOp.promise) : of(undefined);

    // Wait until first get is completed and call refresh next.
    return initOp$.pipe(
        tap(() => this.runAsyncRefresh(key, fetchFn, refreshMode, needUpdateFn)), // do refresh
        take(1),
        switchMap(() => rs$), // return the rs$
    );
  }

  // refresh action is performed async (non-blocking).
  private runAsyncRefresh<T>(key: string, fetchFn: FetchFn<T>|undefined, refreshMode: RefreshMode, needUpdateFn: NeedUpdateFn<T>): void {
    fromPromise(this._refresh(key, fetchFn, refreshMode, needUpdateFn)).pipe(take(1));
  }

  private async _refresh<T>(key: string, fetchFn: FetchFn<T>|undefined, refreshMode: RefreshMode, needUpdateFn: NeedUpdateFn<T>): Promise<void> {
    if (!fetchFn || refreshMode === RefreshMode.DoNotRefresh) {
      return;
    }

    if (refreshMode === RefreshMode.RefreshOncePerSession && this.refreshSet.has(key)) {
      return;
    }

    const value = await this.doFetch(fetchFn, key);
    if (value !== undefined) {
      await this.set(key, value, needUpdateFn);
    }
  }

  private async doFetch<T>(fetchFn: FetchFn<T>, key: string): Promise<T|undefined> {
    try {
      let fetchOp = this.inFlightFetchOps.get(key) as FetchOp<T>;
      if (!fetchOp) {
        const fetch$ = fetchFn().pipe(
            catchError(() => of(undefined)), // fallback to undefined.
            shareReplay(1),
        );
        fetchOp = {fetch$};
        this.inFlightFetchOps.set(key, fetchOp);
      }
      const result = await fetchOp.fetch$.pipe(take(1)).toPromise();
      if (result !== undefined) {
        this.refreshSet.add(key);
      }
      return result;
    } finally {
      this.inFlightFetchOps.delete(key);
    }
  }

  private registerNewRxStreamForKey<T>(key: string, initValue?: T): ReplaySubject<T|undefined> {
    const rs$ = new ReplaySubject<T|undefined>(1);
    this.dataMap.set(key, rs$);
    if (initValue !== undefined) {
      rs$.next(this.freezeFn(initValue));
    }
    return rs$;
  }

  async set<T>(key: string|undefined, value: T|undefined, needUpdateFn: NeedUpdateFn<T>): Promise<void> {
    if (!key) {
      return;
    }
    {
      const queue = this.setOpsQueue.get(key);
      if (queue) {
        const prevSetOp = queue[queue.length - 1];
        try {
          await prevSetOp.promise; // wait previous set to complete first.
          if (isSameSetOp(value, needUpdateFn, prevSetOp.value, prevSetOp.needUpdateFn)) {
            return;
          }
        } catch (e) {
          // ignore prev-op result.
        }
      }
    }
    try {
      const setImplPromise$$ = this.setImpl(key, value, needUpdateFn);
      const queue = this.setOpsQueue.get(key) || [];
      queue.push({promise: setImplPromise$$, value, needUpdateFn});
      if (queue.length === 1) {
        this.setOpsQueue.set(key, queue);
      }
      await setImplPromise$$;
    } finally {
      const queue = this.setOpsQueue.get(key)!;
      if (queue.length === 1) {
        this.setOpsQueue.delete(key);
      } else {
        const [, ...tail] = queue;
        this.setOpsQueue.set(key, tail);
      }
    }
  }

  private async setImpl<T>(key: string, value: T|undefined, needUpdateFn: NeedUpdateFn<T>): Promise<void> {
    const inRefreshSet = this.refreshSet.has(key);
    const store = await this.storeAdapter$$;
    if (needUpdateFn !== skipUpdateCheck) {
      const oldValue = await store.get<T>(key);
      if (!needUpdateFn(oldValue, value)) {
        const firstUpdate = !inRefreshSet;
        const forceUpdate = firstUpdate && value === undefined && oldValue === undefined;
        if (!forceUpdate) {
          return;
        }
      }
    }
    if (!inRefreshSet) {
      this.refreshSet.add(key);
    }
    await store.set(key, value);
    const rs$ = this.dataMap.get(key);
    if (rs$) {
      rs$.next(this.freezeFn(value));
    }
  }

  async remove<T>(key: string|undefined): Promise<void> {
    this.set(key, undefined, skipUpdateCheck);
  }

  async list<T>(keyPrefix: string): Promise<KV<T>[]> {
    const store = await this.storeAdapter$$;
    return store.list(keyPrefix);
  }

  async clear(): Promise<void> {
    const store = await this.storeAdapter$$;
    this.dataMap.forEach(subj$ => subj$.next(undefined));
    return store.clear();
  }

  /**
   * When PWA is initialized it receives server state as an input. This server state may already be outdated (new data is fetched by AJAX).
   * This method checks if the state is new (never seen before) and runs DB data update only if server state was never seen before.
   */
  private async updateDbStateFromServerState(adapter: StoreAdapter, serverState: any): Promise<void> {
    const serverStateTimestamp = serverState[SERVER_STATE_TIMESTAMP_KEY];
    const dbVersionOfServerState = await adapter.get(SERVER_STATE_TIMESTAMP_KEY);
    if (serverStateTimestamp === dbVersionOfServerState) {
      return;
    }
    await adapter.setAll(serverState);
    for (const [key, value] of Object.entries(serverState)) { // instantiate subjects -> they will be needed on browser re-render.
      this.registerNewRxStreamForKey(key, value);
      this.refreshSet.add(key);
    }
  }
}

function pairsToObject(pairs: KV<unknown>[]): { [key: string]: any } {
  const res: any = {};
  for (const {key, value} of pairs) {
    res[key] = value;
  }
  return res;
}

function noFreeze<T>(obj: T|undefined): T|undefined {
  return obj;
}

// noinspection JSUnusedLocalSymbols,JSUnusedGlobalSymbols
function deepFreeze<T>(obj: T|undefined): T|undefined {
  if (obj === undefined) {
    return undefined;
  }
  Object.freeze(obj);
  for (const prop of Object.getOwnPropertyNames(obj)) {
    const value = obj[prop];
    if ((typeof value === 'object' || typeof value === 'function') && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }
  return obj;
}

interface SetOp<T> {
  promise: Promise<void>,
  value: T|undefined;
  needUpdateFn: NeedUpdateFn<T>;
}

interface FetchOp<T> {
  fetch$: Observable<T|undefined>,
}

interface InitOp {
  promise: Promise<void>,
}


function isSameSetOp(value1: any, needUpdateFn1: NeedUpdateFn<any>, value2: any, needUpdateFn2: NeedUpdateFn<any>): boolean {
  if ((needUpdateFn1 === skipUpdateCheck && needUpdateFn2 === skipUpdateCheck) || needUpdateFn1 !== needUpdateFn2) {
    return false;
  }
  if (value1 === value2) {
    return true;
  }
  return !needUpdateFn1(value1, value2);
}

