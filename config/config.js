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
    delayBetweenRequests: parseInt(process.env.DELAY_BETWEEN_REQUESTS) || 3000, // Aumentado para 3s
    maxRetries: parseInt(process.env.MAX_RETRIES) || 5, // Aumentado para 5 tentativas
    maxRuntime: parseInt(process.env.MAX_RUNTIME_HOURS) || 8, // Aumentado para 8 horas
    
    // Novos timeouts melhorados
    requestTimeout: parseInt(process.env.REQUEST_TIMEOUT) || 60000, // 60s
    downloadTimeout: parseInt(process.env.DOWNLOAD_TIMEOUT) || 120000, // 2 minutos
    supabaseTimeout: parseInt(process.env.SUPABASE_TIMEOUT) || 30000, // 30s
    
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
    
    // Keywords combinadas (sticker.ly real + termos úteis brasileiros + trending 2024-2025)
    keywords: [
      // 🔥 Pesquisas em alta (dados reais do sticker.ly)
      'academia', 'flamengo', 'morango do amor', 'lula', 'bolsonaro', 'bom dia', 'chapolin',
      
      // 🏛️ Política e Memes Políticos Trending 2024-2025
      'xandão', 'alexandre moraes', 'nikolas ferreira', 'nikole', 'tarcisio', 'tarcísio freitas',
      'arthur lira', 'flavio dino', 'flávio dino', 'xandinho', 'ditador de toga', 'magnitsky',
      'xandão sem disney', 'impeachment', 'stf', 'supremo', 'deputado', 'ministro',
      'política brasil', 'memes políticos', 'congresso', 'senado', 'câmara',
      
      // 📂 Categorias oficiais
      'musica', 'amor', 'meme', 'tiktok', 'floptok', 'fofo', 'desenhos', 'futebol', 'kpop',
      
      // 🇧🇷 Termos brasileiros úteis (nossa lista anterior)
      'brasil', 'carnaval', 'trabalho', 'família', 'amigos', 'feliz', 'triste', 'raiva', 
      'festa', 'natal', 'animado', 'brasileiro', 'whatsapp', 'engraçado', 'coração', 
      'saudade', 'humor',
      
      // 🎬 Filmes e Séries Trending 2024-2025
      'ainda estou aqui', 'superman', 'avatar', 'mickey 17', 'lilo stitch', 'invocação mal',
      'bridgerton', 'wandinha', 'wednesday', 'griselda', 'sintonia', 'bebê rena', 'baby reindeer',
      'divertida mente', 'inside out', 'fallout', 'queen tears', 'quarteto fantástico',
      'five nights freddys', 'completo desconhecido', 'bob dylan',
      
      // 🎵 Música e Artistas Trending
      'só fé', 'grelo', 'fito paez', 'funk', 'sertanejo', 'pagode', 'rap', 'pop brasileiro',
      'anitta', 'luisa sonza', 'ludmilla', 'wesley safadão', 'gusttavo lima', 'marilia mendonça',
      
      // 📱 Redes Sociais e Tech
      'instagram', 'youtube', 'tiktok shop', 'streaming', 'netflix', 'disney plus', 'amazon prime',
      'realidade virtual', 'inteligência artificial', 'ai', 'tecnologia',
      
      // 🏆 Esportes e Entretenimento
      'bbb', 'big brother', 'copa mundo', 'olympics', 'olimpíadas', 'vasco', 'corinthians',
      'palmeiras', 'são paulo', 'santos', 'botafogo', 'cruzeiro', 'atletico',
      
      // 💄 Lifestyle e Beleza
      'maquiagem', 'skincare', 'academia fitness', 'dieta', 'receitas', 'culinária',
      'viagem', 'sustentabilidade', 'meio ambiente', 'educação financeira',
      
      // 🎭 Expressões e Sentimentos Populares
      'ansiedade', 'depressão', 'motivação', 'gratidão', 'fé', 'esperança', 'paz',
      'segunda feira', 'sexta feira', 'fim semana', 'feriado', 'férias',
      
      // 🎪 Memes e Cultura Pop
      'memes brasil', 'viral', 'trending', 'chapolin colorado', 'chaves', 'turma monica',
      'pokemon', 'dragon ball', 'naruto', 'one piece', 'anime', 'manga',
      
      // 🌟 Celebridades e Influencers
      'whindersson', 'felipe neto', 'kondzilla', 'casimiro', 'gaules', 'authentic games',
      'luccas neto', 'kids', 'família', 'youtubers brasil'
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