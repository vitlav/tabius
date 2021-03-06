/** Browser store names. */
import {environment} from '@app/environments/environment';
import {Song} from '@common/catalog-model';
import {hasValidForumTopic} from '@common/util/misc-utils';

export const USER_STORE_NAME = 'user';
export const CATALOG_STORE_NAME = 'catalog';
export const APP_STORE_NAME = 'tabius';

/** Injection tokens for browser stores. */
export const TABIUS_USER_BROWSER_STORE_TOKEN = 'user';
export const TABIUS_CATALOG_BROWSER_STORE_TOKEN = 'catalog';
export const APP_BROWSER_STORE_TOKEN = 'tabius';

export const NODE_BB_URL = environment.nodeBbUrl;
export const NODE_BB_LOGIN_URL = `${environment.nodeBbUrl}/login`;
export const NODE_BB_REGISTRATION_URL = `${environment.nodeBbUrl}/register`;
export const NODE_BB_ADD_NEW_CATEGORY_URL = `${environment.nodeBbUrl}/category/406`;
