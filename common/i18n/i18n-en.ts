import {I18n} from '@common/i18n/i18n';
import {CollectionType, isBand, isCompilation} from '@common/catalog-model';

const FAVORITES_COLLECTION_NAME = 'Favorites';

export const TRANSLATIONS_MAP_EN: I18n = {
  common: {
    favoritesCollectionName: FAVORITES_COLLECTION_NAME,
    error: (message: string) => `Error: ${message}`,
  },
  navbar: {
    catalog: 'CATALOG',
    forum: 'FORUM',
    logo2: 'chords & tabs',
    noSleep: 'NO SLEEP',
    noSleepTitle: 'Keep mobile phone screen always on',
    settings: 'SETTINGS',
    studio: 'STUDIO',
    tuner: 'TUNER',
    userIconTitle: (username: string) => `Account: ${username}`,
  },
  page404: {
    message: 'Page not found!',
  },
  addSongToCollection: {
    title: 'Add to collection:',
    addToCollectionCheckboxTitle: (collectionName) => `Add song to «${collectionName}»`,
    gotoCollection: 'open »',
    gotoCollectionTitle: 'Open collection page',
    addToFavoritesCheckboxTitle: 'Add song to Favorites',
    favorites: FAVORITES_COLLECTION_NAME,
  },
  catalogPage: {
    title: 'Catalog',
    loadingMessage: 'Loading catalog…',
    searchInputPlaceholder: 'search by name or text',
    searchInputTitle: 'Search by artist name or song text',
    clearButtonTitle: 'Reset filter',
    clear: 'Reset',
    showAllCollections: 'ALL',
    showAllCollectionsTitle: 'Show all collections',
    artistsHeader: 'Artists',
    noArtistsFound: 'No artists found',
    songsHeader: 'Songs',
    addNewArtist: 'Add',
    addNewArtistTitle: 'Add new artist or collection to the catalog',
    searchResultsPrefix: 'Search results for',
    meta: {
      title: 'Catalog: all artists and collections',
      description: 'Full list of all artists and collections on Tabius. Search songs by artist name, title and song.',
      keywords: ['tabs', 'chords', 'guitar', 'artists list', 'search song by text'],
    },
  },
  chordImage: {
    chordsLayoutTitleSuffix: ', chord layout',
  },
  collectionBreadcrumb: {
    catalogLink: 'Catalog',
    catalogLinkTitle: 'Go to catalog',
    studioLink: 'Studio',
    studioLinkTitle: 'Go to personal collections',
  },
  footer: {
    twitterLinkTitle: 'Read the latest site news in Twitter.',
    githubLinkTitle: 'Current version.\nClick to see the latest changes.',
    homePageLinkTitle: 'Home',
  },
  collectionEditor: {
    header: 'Add collection',
    collectionName: 'Name',
    collectionMount: 'Mount',
    collectionType: 'Type',
    person: 'Person',
    band: 'Band',
    compilation: 'Compilation',
    create: 'Create',
    close: 'Close',
  },
  collectionPage: {
    collectionNotFound: 'Collection not found',
    loadingSongList: 'Loading list of songs …',
    addSong: 'Add song',
    collectionsSettings: 'Settings',
    supportLink: 'Support artist »',
    supportLinkTitle: 'Support artist and buy official records.',
    meta: {
      title: (name: string, type: CollectionType) => {
        const typeInfo = isCompilation(type) ? ', collection ' : (isBand(type) ? ', band' : '');
        return `${name}${typeInfo} — songs, chords and tabs for guitar`;
      },
      description: (name: string, firstSongs: string) => `${name} — songs and chords for guitar: ${firstSongs}`,
      keywords: (name: string) => [`${name} chords`, `${name} tabs`, `${name} lyrics`, `${name} songs`],
    },
  },
  shortcuts: {
    title: 'Hot keys',
    nextSong: 'Next song',
    prevSong: 'Previous song',
    saveSong: 'Save song (in edit mode)',
    showHelp: 'Show this dialog',
    collectionPage: {
      addSong: 'Add song',
    },
    songPage: {
      editSong: 'Edit song',
      resetTranspose: 'Reset transpose',
      transposeDown: 'Transpose 1 tone down',
      transposeUp: 'Transpose 1 tone up',
    },
  },
  moderatorPrompt: {
    youAreNotModerator: 'You are not moderator and can\'t change the public catalog :(',
    but: 'But!',
    howToBecomeModeratorHtml: 'It is not hard to become a moderator:<br>suggest chords to a couple of songs on the forum first.',
    forumLink: 'Open forum »',
  },

};