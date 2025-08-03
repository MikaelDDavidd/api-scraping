require('dotenv').config();

const config = {
  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceKey: process.env.SUPABASE_SERVICE_KEY,
    bucketName: process.env.SUPABASE_BUCKET_NAME || 'stickers'
  },
  
  scraping: {
    maxPacksPerRun: parseInt(process.env.MAX_PACKS_PER_RUN) || 50,
    delayBetweenRequests: parseInt(process.env.DELAY_BETWEEN_REQUESTS) || 2000,
    maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
    maxRuntime: parseInt(process.env.MAX_RUNTIME_HOURS) || 5, // Limite de 5 horas
    
    // Configurações de paginação (baseado na API original)
    maxPagesPerKeyword: parseInt(process.env.MAX_PAGES_PER_KEYWORD) || 460, // Como na API original
    maxPacksPerKeyword: parseInt(process.env.MAX_PACKS_PER_KEYWORD) || 62,   // Como na API original
    maxEmptyPagesConsecutive: parseInt(process.env.MAX_EMPTY_PAGES_CONSECUTIVE) || 3,
    
    // Estratégia: recommend SEM paginação + search COM paginação (como API original)
    useRecommendedPacks: process.env.USE_RECOMMENDED_PACKS !== 'false',
    useKeywordSearch: true, // ⭐ SEMPRE ATIVO como na API original
    
    // Locales - Focado apenas no Brasil
    locales: [
      { locale: 'pt-BR', lang: 'pt' }
    ],
    
    // User-Agent para requests (dinâmico como API original)
    userAgent: 'androidapp.stickerly/1.17.3 (Redmi 7; U; Android 29; pt-BR; {locale};)',
    
    // Keywords combinadas (sticker.ly real + termos úteis brasileiros)
    keywords: [
      // 🔥 Pesquisas em alta (dados reais do sticker.ly)
      'academia', 'flamengo', 'morango do amor', 'lula', 'bolsonaro', 'bom dia', 'chapolin',
      
      // 📂 Categorias oficiais
      'musica', 'amor', 'meme', 'tiktok', 'floptok', 'fofo', 'desenhos', 'futebol', 'kpop',
      
      // 🇧🇷 Termos brasileiros úteis (nossa lista anterior)
      'brasil', 'carnaval', 'trabalho', 'família', 'amigos', 'feliz', 'triste', 'raiva', 
      'festa', 'natal', 'animado', 'brasileiro', 'whatsapp', 'engraçado', 'coração', 
      'saudade', 'humor'
    ],
    
    // Device IDs para rotação (para diversificar resultados)
    deviceIds: [
      '20fa5a958492bbd3', // ID original
      '30fb6b068593cce4', // IDs alternativos para diversificação
      '40fc7c178694ddf5',
      '50fd8d289795eef6'
    ],
    
    // URLs da API do sticker.ly
    apiUrls: {
      recommend: 'http://api.sticker.ly/v3.1/stickerPack/recommend?withAnimation=true',
      search: 'http://api.sticker.ly:80/v3.1/stickerPack/search?withAnimation=true'
    }
  },
  
  storage: {
    tempDir: './temp',
    dataDir: './data_captured',
    maxFileSize: 50 * 1024 * 1024, // 50MB
    allowedFormats: ['.webp', '.png', '.gif']
  },
  
  image: {
    // Requisitos específicos do WhatsApp
    traySize: { width: 96, height: 96 },
    stickerSize: { width: 512, height: 512 }, // EXATO para WhatsApp
    quality: 80,
    
    // Limites de tamanho do WhatsApp
    maxTraySize: 50 * 1024,      // 50KB para tray (PNG)
    maxStaticSize: 100 * 1024,   // 100KB para sticker estático  
    maxAnimatedSize: 500 * 1024, // 500KB para sticker animado
    
    formats: {
      input: ['webp', 'png', 'gif'],
      trayOutput: 'png',    // Tray DEVE ser PNG
      stickerOutput: 'webp' // Stickers devem ser WebP
    }
  },
  
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: './logs/scraper.log',
    maxFiles: 5,
    maxSize: '10m'
  }
};

// Validação de configurações essenciais
const validateConfig = () => {
  const required = [
    'supabase.url',
    'supabase.anonKey',
    'supabase.serviceKey'
  ];
  
  for (const key of required) {
    const value = key.split('.').reduce((obj, k) => obj?.[k], config);
    if (!value) {
      throw new Error(`Configuração obrigatória não encontrada: ${key}`);
    }
  }
};

module.exports = { config, validateConfig };