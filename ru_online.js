/* Lampa.plugin standalone marker for CUB validation */
(function () {
  'use strict';

  if (window.__legal_ru_online_plugin) return;
  window.__legal_ru_online_plugin = true;

  var mainSourcePatched = {};
  var tmdbGetPatched = false;
  var tmdbListPatched = false;
  var tmdbCategoryPatched = false;
  var partNextPatched = false;
  var pluginBooted = false;
  var patchWatcher = 0;
  var mainBuildPending = false;
  var homeReloadWatcher = 0;
  var homeReloadRequested = false;
  var activityReloadTimer = 0;
  var reloadedActivityKeys = {};
  var arrayToString = Object.prototype.toString;
  var pluginManifest = {
    type: 'video',
    version: '1.0.0',
    name: 'Русские фильмы и сериалы',
    description: 'Первые ряды на главной: только вышедшие русские фильмы и сериалы, доступные для онлайн-просмотра',
    component: 'legal_ru_online'
  };

  var BLOCKS = [
    {
      title: '\u0420\u0443\u0441\u0441\u043A\u0438\u0435 \u0444\u0438\u043B\u044C\u043C\u044B',
      query: 'discover/movie?sort_by=primary_release_date.desc&watch_region=RU&with_watch_monetization_types=flatrate|free&with_origin_country=RU&with_original_language=ru&without_genres=16&primary_release_date.lte=',
      source: 'tmdb',
      small: false,
      wide: false
    },
    {
      title: '\u0420\u0443\u0441\u0441\u043A\u0438\u0435 \u0441\u0435\u0440\u0438\u0430\u043B\u044B',
      query: 'discover/tv?sort_by=first_air_date.desc&watch_region=RU&with_watch_monetization_types=flatrate|free&with_origin_country=RU&with_original_language=ru&without_genres=16&first_air_date.lte=',
      source: 'tmdb',
      small: true,
      wide: true
    }
  ];

  function getCurrentDate() {
    var date = new Date();
    var year = String(date.getFullYear());
    var month = String(date.getMonth() + 1);
    var day = String(date.getDate());

    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;

    return year + '-' + month + '-' + day;
  }

  function isArray(value) {
    return arrayToString.call(value) === '[object Array]';
  }

  function todayKey() {
    var now = new Date();
    return now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate();
  }

  function getActiveActivity() {
    var lampa = getLampa();
    if (!lampa || !lampa.Activity || typeof lampa.Activity.active !== 'function') return null;
    return lampa.Activity.active();
  }

  function isMatchingCategoryActivity(active) {
    return !!(active && (active.component === 'category_full' || active.component === 'category' || active.component === 'category_one') && active.source === 'tmdb' && active.url);
  }

  function requestHomeReloadIfNeeded() {
    var lampa = getLampa();
    var active;
    var key;

    if (!lampa || !lampa.Activity || typeof lampa.Activity.replace !== 'function') return;

    active = getActiveActivity();
    if (!active || active.component !== 'main') return;

    key = 'legal_ru_online_main_reload:' + todayKey();
    if (lampa.Storage && lampa.Storage.get(key)) return;

    lampa.Storage && lampa.Storage.set(key, '1');
    homeReloadRequested = true;

    setTimeout(function () {
      lampa.Activity.replace({
        component: 'main',
        source: 'tmdb',
        page: active && active.page ? active.page : 1,
        title: active && active.title ? active.title : '\u0413\u043B\u0430\u0432\u043D\u0430\u044F - TMDB'
      });
    }, 600);
  }

  function watchInitialMainReload() {
    var attempts = 0;

    if (homeReloadWatcher) return;

    homeReloadWatcher = setInterval(function () {
      attempts++;
      requestHomeReloadIfNeeded();

      if (homeReloadRequested || attempts >= 40) {
        clearInterval(homeReloadWatcher);
        homeReloadWatcher = 0;
      }
    }, 250);
  }

  function scheduleActivityReloadCheck() {
    var lampa = getLampa();
    if (!lampa || !lampa.Activity || typeof lampa.Activity.replace !== 'function') return;

    if (activityReloadTimer) clearTimeout(activityReloadTimer);
    activityReloadTimer = setTimeout(function () {
      var active = getActiveActivity();
      var key;

      activityReloadTimer = 0;

      if (!isMatchingCategoryActivity(active)) return;
      key = 'category:' + String(active.url || '');
      if (reloadedActivityKeys[key]) return;
      reloadedActivityKeys[key] = true;

      lampa.Activity.replace({
        component: active.component,
        source: active.source,
        url: active.url,
        title: active.title,
        page: active.page || 1,
        card_type: active.card_type !== false
      });
    }, 450);
  }

  function resolveCategoryUrl(block) {
    if (!block || !block.query) return '';
    if (/lte=$/.test(block.query)) return block.query + getCurrentDate();
    return block.query;
  }

  function getLampa() {
    return window.Lampa || null;
  }

  function registerManifest() {
    var lampa = getLampa();

    if (!lampa || !lampa.Manifest || window.__legalRuOnlineManifestRegistered) return;
    window.__legalRuOnlineManifestRegistered = true;

    if (typeof Lampa !== 'undefined' && Lampa && Lampa.Manifest) {
      Lampa.Manifest.plugins = pluginManifest;
    } else {
      lampa.Manifest.plugins = pluginManifest;
    }
  }

  function installLampaHook() {
    var capturedLampa;

    if (window.Lampa || window.__legalRuLampaHookInstalled) return;
    window.__legalRuLampaHookInstalled = true;

    Object.defineProperty(window, 'Lampa', {
      configurable: true,
      enumerable: true,
      get: function () {
        return capturedLampa;
      },
      set: function (value) {
        capturedLampa = value;
        delete window.Lampa;
        window.Lampa = value;
        registerManifest();

        setTimeout(function () {
          init();
        }, 0);
      }
    });
  }

  function getResultDateValue(item) {
    if (!item || typeof item !== 'object') return '';
    return item.release_date || item.first_air_date || item.air_date || item.year || '';
  }

  function hasPoster(item) {
    return !!(item && typeof item === 'object' && item.poster_path);
  }

  function getResultTitleValue(item) {
    if (!item || typeof item !== 'object') return '';
    return String(item.title || item.name || item.original_title || item.original_name || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function getResultYearValue(item) {
    var date = getResultDateValue(item);
    if (!date) return '';
    return String(date).slice(0, 4);
  }

  function buildResultDedupeKey(item) {
    return getResultTitleValue(item) + '|' + getResultYearValue(item);
  }

  function filterResultsWithPoster(results) {
    var filtered = [];
    var i;

    if (!isArray(results) || !results.length) return filtered;

    for (i = 0; i < results.length; i++) {
      if (hasPoster(results[i])) filtered.push(results[i]);
    }

    return filtered;
  }

  function dedupeResults(results) {
    var deduped = [];
    var seen = {};
    var i;
    var key;

    if (!isArray(results) || !results.length) return deduped;

    for (i = 0; i < results.length; i++) {
      key = buildResultDedupeKey(results[i]);
      if (!key || key === '|') {
        deduped.push(results[i]);
        continue;
      }
      if (seen[key]) continue;
      seen[key] = true;
      deduped.push(results[i]);
    }

    return deduped;
  }

  function sortResultsByDate(results) {
    if (!isArray(results) || results.length < 2) return results;

    results.sort(function (left, right) {
      var leftDate = getResultDateValue(left);
      var rightDate = getResultDateValue(right);
      var leftTitle;
      var rightTitle;

      if (leftDate !== rightDate) return leftDate < rightDate ? 1 : -1;

      leftTitle = String((left && (left.title || left.name)) || '').toLowerCase();
      rightTitle = String((right && (right.title || right.name)) || '').toLowerCase();

      if (leftTitle === rightTitle) return 0;
      return leftTitle > rightTitle ? 1 : -1;
    });

    return results;
  }

  function normalizeBlock(block, data) {
    data = normalizeResultsData(data);

    data.title = block.title;
    data.name = block.title;
    data.small = !!block.small;
    data.wide = !!block.wide;

    return data;
  }

  function normalizeResultsData(data) {
    var i;

    if (!data || typeof data !== 'object') {
      data = { results: [] };
    }

    if (!isArray(data.results)) {
      data.results = [];
    }

    data.results = filterResultsWithPoster(data.results);
    data.results = dedupeResults(data.results);
    sortResultsByDate(data.results);

    for (i = 0; i < data.results.length; i++) {
      data.results[i].promo = data.results[i].overview;
      data.results[i].promo_title = data.results[i].title || data.results[i].name;
    }

    return data;
  }

  function findBlockByResolvedUrl(url) {
    var i;
    var block;
    var resolved;

    if (!url) return null;

    for (i = 0; i < BLOCKS.length; i++) {
      block = BLOCKS[i];
      resolved = resolveCategoryUrl(block);
      if (resolved === url) return block;
    }

    return null;
  }

  function buildHomeRequests() {
    var lampa = getLampa();
    var requests = [];
    var i;
    var block;

    if (!lampa || !lampa.Api || !lampa.Api.sources) return requests;

    for (i = 0; i < BLOCKS.length; i++) {
      block = BLOCKS[i];
      if (!lampa.Api.sources[block.source] || typeof lampa.Api.sources[block.source].get !== 'function') continue;

      requests.push((function (item) {
        return function (nextCallback) {
          lampa.Api.sources[item.source].get(resolveCategoryUrl(item), {}, function (data) {
            nextCallback(normalizeBlock(item, data));
          }, function () {
            nextCallback(normalizeBlock(item, { results: [] }));
          });
        };
      })(block));
    }

    return requests;
  }

  function isMainRoute() {
    var search = String(window.location.search || '');

    if (!search) return true;
    return search.indexOf('component=main') !== -1;
  }

  function moveItemTo(compItems, fromIndex, toIndex) {
    var item;

    if (!isArray(compItems)) return;
    if (fromIndex < 0 || fromIndex >= compItems.length) return;
    if (toIndex < 0) toIndex = 0;
    if (toIndex >= compItems.length) toIndex = compItems.length - 1;
    if (fromIndex === toIndex) return;

    item = compItems.splice(fromIndex, 1)[0];
    compItems.splice(toIndex, 0, item);
  }

  function promoteMainRows() {
    var lampa = getLampa();
    var active;
    var comp;
    var host;
    var scroll;
    var body;
    var lines;
    var filmLine = null;
    var seriesLine = null;
    var i;
    var title;
    var filmIndex = -1;
    var seriesIndex = -1;

    if (!lampa || !lampa.Activity || typeof lampa.Activity.active !== 'function') return;
    if (!isMainRoute()) return;

    active = lampa.Activity.active();
    if (!active || active.component !== 'main') return;
    if (!active.activity || !active.activity.component) return;

    comp = active.activity.component;
    host = comp.html && comp.html[0] ? comp.html[0] : comp.html;
    if (!host || !host.querySelectorAll) return;

    scroll = null;
    body = null;
    lines = [];

    for (i = 0; i < host.children.length; i++) {
      if (!scroll && host.children[i] && /(^|\s)scroll(\s|$)/.test(host.children[i].className || '')) {
        scroll = host.children[i];
      }
      if (host.children[i] && /(^|\s)items-line(\s|$)/.test(host.children[i].className || '')) {
        lines.push(host.children[i]);
      }
    }

    if (scroll && scroll.querySelector) {
      body = scroll.querySelector('.scroll__body');
      if (body) {
        for (i = 0; i < body.children.length; i++) {
          if (body.children[i] && /(^|\s)items-line(\s|$)/.test(body.children[i].className || '')) {
            lines.push(body.children[i]);
          }
        }
      }
    }

    if (!lines || !lines.length) return;

    for (i = 0; i < lines.length; i++) {
      title = ((lines[i].querySelector('.items-line__title') || {}).innerText || '').trim();
      if (!filmLine && title === '\u0420\u0443\u0441\u0441\u043A\u0438\u0435 \u0444\u0438\u043B\u044C\u043C\u044B') filmLine = lines[i];
      if (!seriesLine && title === '\u0420\u0443\u0441\u0441\u043A\u0438\u0435 \u0441\u0435\u0440\u0438\u0430\u043B\u044B') seriesLine = lines[i];
    }

    if (body) {
      if (filmLine && body.firstChild !== filmLine) {
        body.insertBefore(filmLine, body.firstChild);
      }

      if (seriesLine && filmLine && filmLine.nextSibling !== seriesLine) {
        body.insertBefore(seriesLine, filmLine.nextSibling);
      }
    } else {
      if (filmLine && host.firstChild !== filmLine) {
        host.insertBefore(filmLine, host.firstChild);
      }

      if (seriesLine && filmLine && filmLine.nextSibling !== seriesLine) {
        host.insertBefore(seriesLine, filmLine.nextSibling);
      }
    }

    if (comp.items && isArray(comp.items)) {
      for (i = 0; i < comp.items.length; i++) {
        title = comp.items[i] && comp.items[i].data ? comp.items[i].data.title : '';
        if (title === '\u0420\u0443\u0441\u0441\u043A\u0438\u0435 \u0444\u0438\u043B\u044C\u043C\u044B') filmIndex = i;
        if (title === '\u0420\u0443\u0441\u0441\u043A\u0438\u0435 \u0441\u0435\u0440\u0438\u0430\u043B\u044B') seriesIndex = i;
      }

      if (filmIndex > 0) {
        moveItemTo(comp.items, filmIndex, 0);
        if (seriesIndex === 0) seriesIndex = filmIndex;
      }

      if (seriesIndex > 1) {
        moveItemTo(comp.items, seriesIndex, 1);
      }
    }
  }

  function enhanceTmdbSource() {
    var lampa = getLampa();
    var originalTmdbMain;
    var originalTmdbGet;
    var originalTmdbList;
    var originalTmdbCategory;
    var originalPartNext;

    if (!lampa || !lampa.Api || !lampa.Api.sources || !lampa.Api.sources.tmdb) return;

    if (!tmdbGetPatched && typeof lampa.Api.sources.tmdb.get === 'function') {
      originalTmdbGet = lampa.Api.sources.tmdb.get;
      lampa.Api.sources.tmdb.get = function (url, params, callback, errorCallback) {
        var block = findBlockByResolvedUrl(url);
        var enhancedGetCallback = callback;

        if (block && typeof callback === 'function') {
          enhancedGetCallback = function (data) {
            callback(normalizeResultsData(data));
          };
        }

        return originalTmdbGet.call(this, url, params, enhancedGetCallback, errorCallback);
      };

      tmdbGetPatched = true;
    }

    if (!tmdbCategoryPatched && typeof lampa.Api.sources.tmdb.category === 'function') {
      originalTmdbCategory = lampa.Api.sources.tmdb.category;
      lampa.Api.sources.tmdb.category = function (params, callback, errorCallback) {
        var block = findBlockByResolvedUrl(params && params.url);
        var enhancedCategoryCallback = callback;

        if (block && typeof callback === 'function') {
          enhancedCategoryCallback = function (data) {
            callback(normalizeResultsData(data));
          };
        }

        return originalTmdbCategory.call(this, params, enhancedCategoryCallback, errorCallback);
      };

      tmdbCategoryPatched = true;
    }

    if (!tmdbListPatched && typeof lampa.Api.sources.tmdb.list === 'function') {
      originalTmdbList = lampa.Api.sources.tmdb.list;
      lampa.Api.sources.tmdb.list = function (params, callback, errorCallback) {
        var block = findBlockByResolvedUrl(params && params.url);
        var enhancedListCallback = callback;

        if (block && typeof callback === 'function') {
          enhancedListCallback = function (data) {
            callback(normalizeResultsData(data));
          };
        }

        return originalTmdbList.call(this, params, enhancedListCallback, errorCallback);
      };

      tmdbListPatched = true;
    }

    if (!partNextPatched && typeof lampa.Api.partNext === 'function') {
      originalPartNext = lampa.Api.partNext;
      lampa.Api.partNext = function (requests, count, success, error) {
        var additionalRequests;

        if (mainBuildPending) {
          additionalRequests = buildHomeRequests();
          mainBuildPending = false;
          if (additionalRequests && additionalRequests.length) {
            return originalPartNext.call(this, additionalRequests.concat(requests || []), count, success, error);
          }
        }

        return originalPartNext.call(this, requests, count, success, error);
      };

      partNextPatched = true;
    }

    Object.keys(lampa.Api.sources).forEach(function (sourceName) {
      var source = lampa.Api.sources[sourceName];
      var originalMain;

      if (!source || typeof source.main !== 'function' || mainSourcePatched[sourceName]) return;
      originalMain = source.main;
      source.main = function () {
        mainBuildPending = true;
        return originalMain.apply(this, arguments);
      };
      mainSourcePatched[sourceName] = true;
    });
  }

  function allTmdbPatched() {
    return tmdbGetPatched && tmdbListPatched && tmdbCategoryPatched && partNextPatched;
  }

  function ensureTmdbPatched() {
    enhanceTmdbSource();
    promoteMainRows();
  }

  function startPatchWatcher() {
    if (patchWatcher) return;

    patchWatcher = setInterval(function () {
      enhanceTmdbSource();
      promoteMainRows();
    }, 50);
  }

  function bootPlugin() {
    if (pluginBooted) return;
    pluginBooted = true;
    ensureTmdbPatched();
    startPatchWatcher();
    requestHomeReloadIfNeeded();
    watchInitialMainReload();
    scheduleActivityReloadCheck();
  }

  function init() {
    var lampa = getLampa();
    registerManifest();
    bootPlugin();

    if (lampa && lampa.Listener && typeof lampa.Listener.follow === 'function') {
      lampa.Listener.follow('app', function (e) {
        if (e && e.type === 'ready') {
          ensureTmdbPatched();
          startPatchWatcher();
          requestHomeReloadIfNeeded();
          watchInitialMainReload();
          scheduleActivityReloadCheck();
        }
      });
      lampa.Listener.follow('activity', function () {
        scheduleActivityReloadCheck();
      });
    }
  }

  installLampaHook();
  init();
})();

