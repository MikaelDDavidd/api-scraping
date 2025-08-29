const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

class SearchCache {
  constructor() {
    this.cacheDir = path.join(process.cwd(), '.cache');
    this.cacheFile = path.join(this.cacheDir, 'search_history.json');
    this.cache = this.loadCache();
    this.maxCacheAge = 7 * 24 * 60 * 60 * 1000; // 7 dias
  }

  loadCache() {
    try {
      if (fs.existsSync(this.cacheFile)) {
        const data = fs.readJsonSync(this.cacheFile);
        // Limpar entradas antigas
        const now = Date.now();
        Object.keys(data).forEach(key => {
          if (now - data[key].timestamp > this.maxCacheAge) {
            delete data[key];
          }
        });
        return data;
      }
    } catch (err) {
      console.error('Erro ao carregar cache:', err);
    }
    return {};
  }

  saveCache() {
    try {
      fs.ensureDirSync(this.cacheDir);
      fs.writeJsonSync(this.cacheFile, this.cache, { spaces: 2 });
    } catch (err) {
      console.error('Erro ao salvar cache:', err);
    }
  }

  generateKey(keyword, locale, page) {
    return crypto
      .createHash('md5')
      .update(`${keyword}-${locale}-${page}`)
      .digest('hex');
  }

  hasSearched(keyword, locale, page) {
    const key = this.generateKey(keyword, locale, page);
    const entry = this.cache[key];
    
    if (!entry) return false;
    
    // Verificar se não expirou
    if (Date.now() - entry.timestamp > this.maxCacheAge) {
      delete this.cache[key];
      return false;
    }
    
    return true;
  }

  markSearched(keyword, locale, page, metadata = {}) {
    const key = this.generateKey(keyword, locale, page);
    this.cache[key] = {
      keyword,
      locale,
      page,
      timestamp: Date.now(),
      ...metadata
    };
    this.saveCache();
  }

  getSearchInfo(keyword, locale) {
    const info = {
      pagesSearched: [],
      lastSearch: null,
      totalPacks: 0
    };

    Object.values(this.cache).forEach(entry => {
      if (entry.keyword === keyword && entry.locale === locale) {
        info.pagesSearched.push(entry.page);
        info.totalPacks += entry.packsFound || 0;
        if (!info.lastSearch || entry.timestamp > info.lastSearch) {
          info.lastSearch = entry.timestamp;
        }
      }
    });

    info.pagesSearched.sort((a, b) => a - b);
    return info;
  }

  clearOldEntries() {
    const now = Date.now();
    let removed = 0;
    
    Object.keys(this.cache).forEach(key => {
      if (now - this.cache[key].timestamp > this.maxCacheAge) {
        delete this.cache[key];
        removed++;
      }
    });
    
    if (removed > 0) {
      this.saveCache();
    }
    
    return removed;
  }

  getStats() {
    const stats = {
      totalEntries: Object.keys(this.cache).length,
      keywords: new Set(),
      oldestEntry: null,
      newestEntry: null
    };

    Object.values(this.cache).forEach(entry => {
      stats.keywords.add(entry.keyword);
      
      if (!stats.oldestEntry || entry.timestamp < stats.oldestEntry) {
        stats.oldestEntry = entry.timestamp;
      }
      
      if (!stats.newestEntry || entry.timestamp > stats.newestEntry) {
        stats.newestEntry = entry.timestamp;
      }
    });

    stats.keywords = Array.from(stats.keywords);
    return stats;
  }
}

module.exports = SearchCache;