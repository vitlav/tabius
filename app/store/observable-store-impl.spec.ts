import {InMemoryStoreAdapter} from '@app/store/in-memory-store-adapter';
import {ObservableStoreImpl} from '@app/store/observable-store-impl';
import {KV, StoreAdapter} from '@app/store/store-adapter';
import {RefreshMode, skipUpdateCheck} from '@app/store/observable-store';
import {delay, switchMap, take} from 'rxjs/operators';
import {of, ReplaySubject} from 'rxjs';
import {checkUpdateByStringify} from '@app/store/check-update-functions';

/** No-Op impl used in tests. */
class NoOpStoreAdapter implements StoreAdapter {
  calls: string[] = [];

  clear(): Promise<void> {
    this.calls.push('clear');
    return Promise.resolve();
  }

  get<T>(key: string): Promise<T|undefined> {
    this.calls.push('get');
    return Promise.resolve(undefined);
  }

  getAll<T>(keys: ReadonlyArray<string>): Promise<(T|undefined)[]> {
    this.calls.push('getAll');
    return Promise.resolve([]);
  }

  init(schemaVersion: number): Promise<void> {
    this.calls.push('init');
    return Promise.resolve();
  }

  list<T>(keyPrefix?: string): Promise<KV<T>[]> {
    this.calls.push('list');
    return Promise.resolve([]);
  }

  set<T>(key: string, value: T|undefined): Promise<void> {
    this.calls.push('set');
    return Promise.resolve();
  }

  setAll(map: { [p: string]: any }): Promise<void> {
    this.calls.push('setAll');
    return Promise.resolve();
  }

  snapshot(): KV<unknown>[] {
    this.calls.push('snapshot');
    return [];
  }

}

describe('ObservableStore', () => {

  it('calls store adapter factory with correct params', () => {
    let calledName = '';
    let calledBrowser: boolean|undefined = undefined;
    const adapterFactory = (name, browser) => {
      calledName = name;
      calledBrowser = browser;
      return new InMemoryStoreAdapter();
    };

    new ObservableStoreImpl('name1', true, adapterFactory);
    expect(calledName).toBe('name1');
    expect(calledBrowser).toBeTruthy();

    new ObservableStoreImpl('name2', false, adapterFactory);
    expect(calledName).toBe('name2');
    expect(calledBrowser).toBeFalsy();
  });

  it('never calls set or get on un-initialized adapter', async (done) => {
    let initCalled = false;
    let markAdapterAsInitialized: () => void = () => {
    };

    class StoreAdapter extends NoOpStoreAdapter {
      init(schemaVersion: number): Promise<void> {
        const promise = new Promise<void>(resolve => {
          initCalled = true;
          markAdapterAsInitialized = resolve;
        });
        return Promise.all([super.init(schemaVersion), promise]) as any as Promise<void>;
      }

      get<T>(key: string): Promise<T|undefined> {
        return super.get(key).then(() => 'value' as any as T);
      }
    }

    const adapter = new StoreAdapter();
    const store = new ObservableStoreImpl('name', true, () => adapter);
    expect(initCalled).toBeTruthy();

    // noinspection ES6MissingAwait
    const set$$ = store.set('key', 'value', skipUpdateCheck);
    expect(adapter.calls.filter(n => n === 'set').length).toBe(0);

    const get$$ = store.get<string>('key', undefined, RefreshMode.DoNotRefresh, skipUpdateCheck).pipe(take(1)).toPromise();
    expect(adapter.calls.filter(n => n === 'get').length).toBe(0);

    markAdapterAsInitialized();

    await Promise.all([set$$, get$$]);
    expect(adapter.calls.filter(n => n === 'set').length).toBe(1);
    expect(adapter.calls.filter(n => n === 'get').length).toBe(1);
    done();
  });

  it('fetches and sets value to adapter if it was missed', async (done) => {
    let setKey = '';
    let setValue: any = undefined;

    class StoreAdapter extends NoOpStoreAdapter {
      set<T>(key: string, value: T|undefined): Promise<void> {
        setKey += key; // the way to check in this test that 'set' was called only once.
        setValue = value;
        return Promise.resolve();
      }
    }

    const store = new ObservableStoreImpl('name', true, () => new StoreAdapter());

    const getKey = 'key';
    const fetchedValue = 'fetched';
    const returnValue = await store.get<string>(getKey, () => of(fetchedValue), RefreshMode.DoNotRefresh, skipUpdateCheck).pipe(take(1)).toPromise();

    expect(returnValue).toBe(fetchedValue);
    expect(setKey).toBe(getKey);
    expect(setValue).toBe(fetchedValue);

    done();
  });

  it('should respect RefreshMode.RefreshOncePerSession', async (done) => {
    let nFetchesCalled = 0;
    const fetchFn = () => {
      nFetchesCalled++;
      return of('value');
    };
    const store = new ObservableStoreImpl('name1', true, () => new NoOpStoreAdapter());
    const key = 'Key';
    const v1 = await store.get<string>(key, fetchFn, RefreshMode.RefreshOncePerSession, checkUpdateByStringify).pipe(take(1)).toPromise();
    const v2 = await store.get<string>(key, fetchFn, RefreshMode.RefreshOncePerSession, checkUpdateByStringify).pipe(take(1)).toPromise();
    expect(v1).toBe(v2);
    expect(nFetchesCalled).toBe(1);
    done();
  });

  it('should not call fetchFn twice for RefreshMode.RefreshOncePerSession in parallel', async (done) => {
    let nFetchesCalled = 0;
    const key = 'Key';
    const value = 'Value';
    const resolver$ = new ReplaySubject(1);
    const fetchFn = () => {
      nFetchesCalled++;
      return resolver$.pipe(switchMap(() => of(value)));
    };
    const store = new ObservableStoreImpl('store', true, () => new NoOpStoreAdapter());
    const v1$$ = store.get<string>(key, fetchFn, RefreshMode.RefreshOncePerSession, checkUpdateByStringify).pipe(take(1)).toPromise();
    const v2$$ = store.get<string>(key, fetchFn, RefreshMode.RefreshOncePerSession, checkUpdateByStringify).pipe(take(1)).toPromise();
    resolver$.next();
    const res = await Promise.all([v1$$, v2$$]);
    expect(nFetchesCalled).toBe(1);
    expect(res).toEqual([value, value]);
    done();
  });

  it('should not call fetchFn twice for RefreshMode.RefreshOncePerSession in parallel with delay', async (done) => {
    let nFetchesCalled = 0;
    const key = 'Key';
    const value = 'Value';
    const resolver$ = new ReplaySubject(1);
    const fetchFn = () => {
      nFetchesCalled++;
      return resolver$.pipe(delay(100), switchMap(() => of(value)));
    };
    const store = new ObservableStoreImpl('store', true, () => new NoOpStoreAdapter());
    const v1$$ = store.get<string>(key, fetchFn, RefreshMode.RefreshOncePerSession, checkUpdateByStringify).pipe(take(1)).toPromise();
    const v2$$ = store.get<string>(key, fetchFn, RefreshMode.RefreshOncePerSession, checkUpdateByStringify).pipe(take(1)).toPromise();
    resolver$.next();
    const res = await Promise.all([v1$$, v2$$]);
    expect(nFetchesCalled).toBe(1);
    expect(res).toEqual([value, value]);
    done();
  });

  it('should not call fetchFn for RefreshMode.RefreshOncePerSession if there was set before', async (done) => {
    const key = 'Key';
    const value = 'Value';

    class TestStoreAdapter extends NoOpStoreAdapter {
      get = <T>(k: string): Promise<T|undefined> => (Promise.resolve(k === key ? value : undefined) as Promise<T|undefined>);
    }

    let nFetchesCalled = 0;
    const fetchFn = () => {
      nFetchesCalled++;
      return of(value);
    };

    const store = new ObservableStoreImpl('store', true, () => new TestStoreAdapter());
    await store.set<string>(key, value, skipUpdateCheck);
    await store.get<string>(key, fetchFn, RefreshMode.RefreshOncePerSession, checkUpdateByStringify).pipe(take(1)).toPromise();
    expect(nFetchesCalled).toBe(0);
    done();
  });

  it('should not call fetchFn for RefreshMode.DoNotRefresh', async (done) => {
    let nFetchesCalled = 0;
    const key = 'Key';
    const value = 'Value';

    class TestStoreAdapter extends NoOpStoreAdapter {
      get = <T>(k: string): Promise<T|undefined> => (Promise.resolve(k === key ? value : undefined) as Promise<T|undefined>);
    }

    const fetchFn = () => {
      nFetchesCalled++;
      return of('?');
    };
    const store = new ObservableStoreImpl('store', true, () => new TestStoreAdapter());
    await store.set<string>(key, value, skipUpdateCheck);
    const result = await store.get<string>(key, fetchFn, RefreshMode.DoNotRefresh, checkUpdateByStringify).pipe(take(1)).toPromise();
    expect(nFetchesCalled).toBe(0);
    expect(result).toBe(value);
    done();
  });

  it('should call fetchFn for RefreshMode.Refresh for all gets', async (done) => {
    let nFetchesCalled = 0;
    const key = 'Key';
    const value = 'Value';
    const fetchFn = () => {
      nFetchesCalled++;
      return of(value);
    };
    const store = new ObservableStoreImpl('store', true, () => new NoOpStoreAdapter());
    await store.get<string>(key, fetchFn, RefreshMode.Refresh, checkUpdateByStringify).pipe(take(1)).toPromise();
    await store.get<string>(key, fetchFn, RefreshMode.Refresh, checkUpdateByStringify).pipe(take(1)).toPromise();
    await store.get<string>(key, fetchFn, RefreshMode.Refresh, checkUpdateByStringify).pipe(take(1)).toPromise();
    await store.get<string>(key, fetchFn, RefreshMode.RefreshOncePerSession, checkUpdateByStringify).pipe(take(1)).toPromise();
    await store.get<string>(key, fetchFn, RefreshMode.DoNotRefresh, checkUpdateByStringify).pipe(take(1)).toPromise();
    expect(nFetchesCalled).toBe(3);
    done();
  });

  it('should return store value when RefreshMode.DoNotRefresh and no fetchFn provided', async (done) => {
    const store = new ObservableStoreImpl('store', true, () => new NoOpStoreAdapter());
    const result = await store.get<string>('some key', undefined, RefreshMode.DoNotRefresh, skipUpdateCheck).pipe(take(1)).toPromise();
    expect(result).toBeUndefined();
    done();
  });

  it('should not be blocked by gets with no subscription', async (done) => {
    const key = 'Key';
    const value = 'Value';
    const fetchFn = () => {
      return of(value);
    };
    const store = new ObservableStoreImpl('store', true, () => new NoOpStoreAdapter());
    store.get<string>(key, fetchFn, RefreshMode.RefreshOncePerSession, skipUpdateCheck);
    const o2 = store.get<string>(key, fetchFn, RefreshMode.RefreshOncePerSession, skipUpdateCheck);
    const res = await o2.pipe(take(1)).toPromise();
    expect(res).toBe(value);
    done();
  });

  it('should not fetch twice with RefreshMode.RefreshOncePerSession when init is delayed', async (done) => {
    const key = 'Key';
    const value = 'Value';
    let nFetchesCalled = 0;
    const fetchFn = () => {
      nFetchesCalled++;
      return of(value);
    };
    const store = new ObservableStoreImpl('store', true, () => new NoOpStoreAdapter());
    const o1 = store.get<string>(key, fetchFn, RefreshMode.RefreshOncePerSession, skipUpdateCheck);
    const o2 = store.get<string>(key, fetchFn, RefreshMode.RefreshOncePerSession, skipUpdateCheck);
    const res1 = await o1.pipe(take(1)).toPromise();
    const res2 = await o2.pipe(take(1)).toPromise();
    expect(res1).toBe(value);
    expect(res2).toBe(value);
    expect(nFetchesCalled).toBe(1);
    done();
  });

  // TODO: add tests for error handling!
});
