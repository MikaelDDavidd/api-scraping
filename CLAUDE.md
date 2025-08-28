# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Core Purpose
This is a production-grade sticker scraping system for the sticker.ly platform, designed to collect and process WhatsApp-compatible stickers with a focus on Brazilian content. The system includes sophisticated duplicate detection, image processing for WhatsApp compliance, and Supabase integration.

## Essential Commands

### Development
```bash
# Install dependencies
npm install

# Run default mode (recommended + keywords scraping)
npm start

# Development mode with auto-reload
npm run dev

# Test mode (1 pack per locale for testing)
node index.js test

# Specific scraping modes
node index.js recommended      # Only recommended packs
node index.js keywords termo1 termo2  # Search specific keywords
node index.js optimized       # Uses lightweight API endpoints
node index.js vps            # Continuous 24/7 operation mode

# View statistics
node index.js stats

# Help
node index.js help
```

### Testing & Analysis
```bash
# Test optimized strategies
node test_optimizations.js

# Test cache system
node test_cache.js

# Analyze categories
node category_analysis.js

# API exploration
node stickerly_api_exploration.js
```

## Critical Architecture Knowledge

### Processing Pipeline
The system follows a strict pipeline that MUST be maintained:
1. **Discovery** → Query sticker.ly API (recommend or search endpoints)
2. **Filtering** → Check duplicates using pre-loaded cache (~3200 existing packs)
3. **Validation** → Ensure WhatsApp compatibility (30 stickers max, proper format)
4. **Download** → Fetch from CDN with retry logic
5. **Processing** → Resize to exact 512x512px, convert to WebP, optimize
6. **Storage** → Upload to Supabase Storage or local filesystem
7. **Database** → Save metadata to Supabase tables

### Service Responsibilities
- **PackProcessor**: Main orchestrator - handles full workflow, session management, and batch processing
- **OptimizedPackProcessor**: Enhanced version with smart strategies and performance metrics
- **StickerlyClient**: API communication with device rotation and rate limiting
- **ImageProcessor**: WhatsApp-compliant image processing (MUST maintain 512x512 for stickers, 96x96 for tray)
- **SupabaseClient**: Database operations and storage management

### WhatsApp Requirements (DO NOT MODIFY)
```javascript
// These are EXACT requirements - any deviation breaks WhatsApp compatibility
stickerSize: { width: 512, height: 512 }  // Exact pixels
traySize: { width: 96, height: 96 }       // Exact pixels
maxStaticSize: 100 * 1024                 // 100KB limit
maxAnimatedSize: 500 * 1024               // 500KB limit
maxStickersPerPack: 30                    // Hard limit
formats: {
  stickerOutput: 'webp',                  // Required format
  trayOutput: 'png'                       // Required format
}
```

### Environment Configuration
Required `.env` variables:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_key
NODE_ENV=development|production
```

### Database Schema
- **packs**: Pack metadata (id, name, author, emoji, tray_image_url)
- **stickers**: Individual stickers (id, pack_id, image_url, emojis, is_animated)
- **scraping_state**: Persistent state for continuous mode
- **stats**: Performance metrics and statistics

### API Endpoints & Strategies
- **v3.1 endpoints** (standard): Full data but larger (~780KB per request)
- **v1 endpoints** (optimized): Lightweight (~53KB) but less data
- **Device rotation**: Uses multiple device IDs to diversify requests
- **Locale focus**: pt-BR for Brazilian content

### Known Issues & Solutions
**Problem**: Application hangs after extended runtime
- Likely causes: Memory leaks, unclosed connections, or resource accumulation
- Investigation points: Check ImageProcessor cleanup, axios connection pooling, Sharp instance management

### Performance Optimizations
- **Fast duplicate checker**: Pre-loads all pack IDs into memory for instant filtering
- **Batch processing**: Groups database operations to reduce round trips
- **Smart caching**: Avoids redundant API calls for known packs
- **Adaptive strategies**: Switches between discovery and efficiency modes based on duplicate rates

### Critical File Paths
- **Entry point**: `index.js` - Command parsing and mode selection
- **Configuration**: `config/config.js` - All system settings
- **Main processor**: `services/packProcessor.js` - Core workflow
- **API client**: `services/stickerlyClient.js` - External API interface
- **Image processing**: `services/imageProcessor.js` - WhatsApp compliance

### Development Guidelines
1. Always validate WhatsApp requirements before processing
2. Maintain exact image dimensions - no approximations
3. Use structured logging with winston for debugging
4. Handle graceful shutdowns to prevent data corruption
5. Test with small batches before running full scraping
6. Monitor memory usage in continuous mode
7. Keep API response samples in `data_captured/` for analysis