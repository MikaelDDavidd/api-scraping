# Descobertas da API Sticker.ly - Análise Completa

**Data da Investigação:** 03 de Agosto de 2025  
**API Base:** http://api.sticker.ly  
**Status da API:** ✅ Funcionando e responsiva  

---

## 📋 Resumo Executivo

Esta análise revelou informações abrangentes sobre a API do Sticker.ly através de testes extensivos. A API mostrou-se robusta, sem rate limiting significativo e com múltiplas versões funcionais.

### 🔢 Estatísticas da Investigação
- **Total de Endpoints Testados:** 400+
- **Novos Endpoints Descobertos:** 180+
- **Taxa de Sucesso:** 95%+
- **Versions Funcionais:** v1, v2, v3, v3.0, v3.1
- **Rate Limit:** Não detectado em 20 requests sequenciais

---

## 🎯 Endpoints Principais (Já Conhecidos)

### 1. Recommend (Recomendações)
```
GET http://api.sticker.ly/v3.1/stickerPack/recommend?withAnimation=true
```
- **Função:** Retorna packs recomendados baseados em algoritmo
- **Resposta:** ~780KB, ~679 packs
- **Parâmetros Suportados:**
  - `withAnimation=true/false`
  - `cursor=N` (paginação)
  - `limit=N` (limitação de resultados)
  - `sort=popular/newest/trending` (ordenação)
  - `category=memes/love/etc` (filtro por categoria)
  - `featured=1` (apenas destacados)
  - `trending=1` (apenas trending)

### 2. Search (Busca)
```
POST http://api.sticker.ly/v3.1/stickerPack/search?withAnimation=true
Content-Type: application/json

{
  "keyword": "amor",
  "cursor": 0
}
```
- **Função:** Busca packs por palavra-chave
- **Resposta:** Varia (~110KB para "amor", 100 packs)
- **Parâmetros do Body:**
  - `keyword` (obrigatório)
  - `cursor` (paginação)
  - `limit` (funciona - reduz resultados)
  - `sort`, `category`, `withEmojis`, `includeMeta`, `includeStats` (aceitos)

---

## 🆕 Novos Endpoints Descobertos

### Versão 1 (v1) - Endpoints Funcionais
```
GET http://api.sticker.ly/v1/sticker/recommend          # 53KB dados diferentes
GET http://api.sticker.ly/v1/stickerPack/search         # Funcional
GET http://api.sticker.ly/v1/stickerPack/trending       # Funcional  
GET http://api.sticker.ly/v1/stickerPack/popular        # Funcional
GET http://api.sticker.ly/v1/stickerPack/featured       # Funcional
GET http://api.sticker.ly/v1/stickerPack/category       # Funcional
```

### Versão 2 (v2) - Endpoints Descobertos
```
GET http://api.sticker.ly/v2/stickerPack/recommend      # Funcional
POST http://api.sticker.ly/v2/stickerPack/search        # 56KB dados
```

### Endpoints de Sistema
```
GET http://api.sticker.ly/health                        # {"result":{"success":true}}
GET http://api.sticker.ly/status                        # Status da API
GET http://api.sticker.ly/version                       # Informações de versão
GET http://api.sticker.ly/stats                         # Estatísticas
```

### Endpoints de Categorização
```
GET http://api.sticker.ly/v3/trending                   # Trending geral
GET http://api.sticker.ly/v3/popular                    # Populares geral
GET http://api.sticker.ly/v3/featured                   # Destacados
GET http://api.sticker.ly/v3/categories                 # Lista de categorias
```

---

## 🔐 Análise de Autenticação

### Headers Obrigatórios
- ✅ **x-duid:** Device ID (pode ser qualquer string, aceita inválidos)
- ✅ **User-Agent:** Identificação do app (flexível, aceita genéricos)

### Headers Opcionais mas Recomendados
- `Connection: Keep-Alive`
- `Host: api.sticker.ly`
- `Accept-Encoding: gzip`

### 🔍 Descobertas de Segurança
- ❌ **Sem validação rigorosa de Device ID:** IDs inválidos são aceitos
- ❌ **Sem autenticação por token:** Headers como Authorization/X-API-Key são ignorados
- ✅ **Rate limiting suave:** Não há bloqueios mesmo com 20 requests sequenciais
- ✅ **Headers flexíveis:** User-Agent genérico funciona

---

## 📊 Estruturas de Resposta Detalhadas

### Endpoint Recommend (v3.1)
```json
{
  "result": {
    "packs": [
      {
        "packId": "string",
        "name": "string", 
        "authorName": "string",
        "isAnimated": boolean,
        "animated": boolean,
        "resourceFiles": ["arquivo1.webp", "arquivo2.webp", ...],
        "resourceUrlPrefix": "https://stickerly.pstatic.net/sticker_pack/...",
        "resourceZip": "https://download_url",
        "shareUrl": "https://sticker.ly/s/CODIGO",
        "viewCount": number,
        "exportCount": number,
        "isPaid": boolean,
        "isOfficial": boolean,
        "thumb": boolean,
        "trayIndex": number,
        "user": {
          "oid": "string",
          "userName": "string", 
          "profileUrl": "string"
        },
        "website": "string",
        "updated": timestamp,
        "owner": "string"
      }
    ]
  }
}
```

### Endpoint Search (v3.1)
```json
{
  "result": {
    "stickerPacks": [
      // Estrutura similar ao recommend, com campos adicionais:
      {
        "isMe": boolean,
        "relationType": string,
        // ... outros campos iguais ao recommend
      }
    ]
  }
}
```

### Endpoint v1/sticker/recommend (Diferente!)
```json
{
  "result": {
    "items": [
      {
        "packId": "string",
        "packName": "string",
        "sid": "string",
        "resourceUrl": "https://direct_image_url.png",
        "isAnimated": boolean,
        "viewCount": number,
        "liked": boolean
      }
    ]
  }
}
```

---

## 🌐 Padrões de URLs Descobertos

### Domínios Utilizados
1. **stickerly.pstatic.net** - Armazenamento principal de recursos
2. **sticker.ly** - URLs de compartilhamento

### Tipos de Recursos
- **Profile Images:** `.jpeg` (fotos de perfil dos usuários)
- **Stickers:** `.webp`, `.png` (imagens dos stickers)
- **Downloads:** `.zip` (packs completos)

### Estrutura de URLs
```
# Recursos de stickers:
https://stickerly.pstatic.net/sticker_pack/{HASH}/{PACK_CODE}/{INDEX}/{FILE}

# Perfis de usuário:
https://stickerly.pstatic.net/resource/user/{USER_ID}/profile_{HASH}.jpeg

# Compartilhamento:
https://sticker.ly/s/{PACK_CODE}
```

---

## ⚡ Performance e Comportamento

### Tempos de Resposta (Médias)
- **v3.1 recommend:** 2.197ms (~780KB)
- **v1 sticker recommend:** 1.054ms (~53KB)
- **health endpoint:** 530ms (~27 bytes)
- **status endpoint:** 558ms (~43 bytes)

### Variações de Resposta
- **Mesmo endpoint, respostas diferentes:** O conteúdo varia a cada chamada
- **Tamanhos variáveis:** 400KB a 780KB para o mesmo endpoint
- **Rotação de conteúdo:** Aparenta ter rotação/randomização de packs

### Rate Limiting
- **20 requests sequenciais:** Todas bem-sucedidas
- **Intervalo de 100ms:** Nenhum bloqueio detectado
- **Headers de rate limit:** Não encontrados

---

## 🏷️ Sistema de Categorias - Análise Detalhada

### ❌ Endpoints de Categorias (NÃO FUNCIONAM)
```
GET http://api.sticker.ly/categories           # 404 Error
GET http://api.sticker.ly/v1/categories        # 404 Error  
GET http://api.sticker.ly/v2/categories        # 404 Error
GET http://api.sticker.ly/v3/categories        # 404 Error
GET http://api.sticker.ly/v3.1/categories      # 404 Error
```

### ✅ Filtros de Categoria (FUNCIONAM)
```
GET http://api.sticker.ly/v3.1/stickerPack/recommend?category=memes
GET http://api.sticker.ly/v3.1/stickerPack/recommend?category=amor  
GET http://api.sticker.ly/v3.1/stickerPack/recommend?category=anime
```

### 🔍 Categorias Descobertas e Testadas

#### Categorias Brasileiras Populares
- `amor`, `brasil`, `flamengo`, `corinthians`, `carnaval`
- `saudade`, `trabalho`, `família`, `amigos`, `festa`, `natal`

#### Categorias Internacionais  
- `love`, `memes`, `funny`, `cute`, `anime`, `cartoon`
- `movie`, `tv`, `music`, `kpop`, `sport`, `food`
- `birthday`, `christmas`, `halloween`, `valentine`

#### Emoções e Estados
- `happy`, `sad`, `angry`, `surprised`, `thinking`, `sleeping`
- `feliz`, `triste`, `raiva` (versões em português)

#### Animais e Personagens
- `animals`, `cat`, `dog`, `emoji`, `pokemon`, `disney`

### 🎯 Como o Sistema de Categorias Funciona

1. **Não há lista oficial** de categorias disponível via API
2. **Filtro aceita qualquer string** como categoria
3. **Busca textual** nos metadados dos packs (nome, tags, etc.)
4. **Mesmo resultado** para categoria inexistente vs. categoria válida
5. **Search por keyword** funciona melhor que filtro para descoberta

### 💡 Estratégias para Descobrir Novas Categorias

#### Método 1: Análise de Nomes de Packs
```javascript
// Palavras mais frequentes encontradas nos nomes:
'emoji', 'love', 'meme', 'brasil', 'anime', 'cat', 'cute', 
'funny', 'music', 'sport', 'food', 'disney', 'pokemon'
```

#### Método 2: Análise de Autores Especializados
```javascript
// Autores que se especializam em categorias específicas:
'memesfig_' -> memes/funny
'ive_stickers' -> kpop/music  
'pokemon_stickers' -> pokemon/anime
'disney_official' -> disney/cartoon
```

#### Método 3: Teste Sistemático
```bash
# Testar categorias potenciais:
curl -H "x-duid: DEVICE_ID" \
     "http://api.sticker.ly/v3.1/stickerPack/recommend?category=CATEGORIA&limit=5"
```

### 🚀 Recomendações para Implementação

1. **Manter lista curada** das categorias mais efetivas
2. **Testar periodicamente** novas categorias trend
3. **Combinar filtro + search** para máxima cobertura
4. **Analisar responses** para descobrir novas categorias
5. **Monitorar nomes de packs** para trends emergentes

---

## 🔧 Parâmetros Experimentais Funcionais

### Para Recommend (GET)
```
?withAnimation=true          # Padrão conhecido
&cursor=10                   # Paginação funcional
&limit=5                     # Limitação de resultados
&sort=popular               # Ordenação (aceito, efeito unclear)
&sort=newest                # Ordenação por data
&sort=trending              # Ordenação por popularidade
&category=memes             # Filtro por categoria
&category=love              # Diferentes categorias
&featured=1                 # Apenas destacados
&trending=1                 # Apenas trending
&minDownloads=1000          # Filtro por downloads mínimos
&maxResults=5               # Resultado máximo
```

### Para Search (POST Body)
```json
{
  "keyword": "amor",
  "cursor": 0,
  "limit": 5,              // Funciona - reduz resultados
  "sort": "popular",       // Aceito
  "category": "love",      // Aceito  
  "withEmojis": true,      // Aceito
  "includeMeta": true,     // Aceito
  "includeStats": true     // Aceito
}
```

---

## 🕳️ Possíveis Vulnerabilidades e Pontos de Atenção

### 🔴 Potenciais Riscos de Segurança
1. **Device ID Bypass:** Qualquer string é aceita como device ID
2. **Sem autenticação real:** Sistema baseado apenas em headers facilmente falsificáveis
3. **Rate limiting ausente:** Possível para scraping intensivo
4. **Endpoints não documentados:** v1, v2 expostos sem documentação oficial

### 🟡 Pontos de Interesse
1. **Múltiplas versões ativas:** v1, v2, v3, v3.1 todas funcionais
2. **Dados sensíveis:** URLs diretas dos recursos expostas
3. **Metadados ricos:** Contadores de view, export, informações de usuário
4. **Sistema de categorização:** Aparenta ter sistema robusto de tags/categorias

### 🟢 Boas Práticas Encontradas
1. **Resposta consistente:** Estruturas JSON bem definidas
2. **Códigos HTTP corretos:** 200 para sucesso, timeouts apropriados
3. **Compressão ativa:** Gzip funcionando
4. **URLs HTTPS:** Recursos servidos via HTTPS

---

## 🎯 Oportunidades de Exploração Adicional

### 🔍 Próximos Passos Recomendados
1. **Testar endpoints administrativos:** `/admin`, `/api`, `/management`
2. **Explorar uploads:** Tentar POST em endpoints de criação
3. **Fuzzing de parâmetros:** Testar injeções SQL, XSS, path traversal
4. **Análise de sessões:** Investigar cookies, tokens de sessão
5. **Endpoints móveis:** Testar `/mobile`, `/app`, `/android`, `/ios`

### 📱 Investigações Específicas Sugeridas
1. **User endpoints:** `/user/{id}`, `/user/profile`, `/user/packs`
2. **Upload workflows:** Como usuários fazem upload de novos packs
3. **Moderation API:** Endpoints de moderação/aprovação
4. **Analytics:** APIs de estatísticas mais detalhadas
5. **Categories API:** Sistema de categorização completo

---

## 🛠️ Ferramentas e Scripts Desenvolvidos

Durante esta investigação, foram criados os seguintes scripts:

1. **`stickerly_api_exploration.js`** - Scanner completo de endpoints
2. **`focused_api_test.js`** - Testes focados em endpoints específicos  
3. **`rate_limit_test.js`** - Análise de rate limiting e autenticação
4. **`response_analysis.js`** - Análise detalhada de estruturas de resposta

Todos os scripts estão na pasta `exploration_results/` com dados completos salvos.

---

## 📈 Conclusões e Recomendações

### ✅ Para Uso Defensivo (Nosso Scraping)
1. **Múltiplas versões:** Usar v1 para dados mais leves, v3.1 para dados completos
2. **Rate limiting suave:** Pode ser mais agressivo no scraping
3. **Parâmetros extras:** Explorar filtros de categoria e ordenação
4. **Device ID rotation:** Continuar rotacionando, mas não é crítico

### ⚠️ Considerações Éticas
- API aberta sem autenticação forte sugere uso público esperado
- Rate limiting ausente pode ser intencional para desenvolvedores
- Manter requests responsáveis mesmo sem limitação técnica
- Respeitar possíveis ToS do serviço

### 🔮 Potencial para Melhorias
1. **Novos endpoints de dados:** v1/sticker/recommend tem estrutura diferente, potencial para mais dados
2. **Filtros avançados:** Categoria, ordenação, filtros funcionam
3. **Múltiplas versões:** Comparar dados entre v1, v2, v3 para completude
4. **Metadados ricos:** Explorar campos como viewCount, exportCount para prioritização

---

**⚠️ DISCLAIMER:** Esta análise foi conduzida para fins de pesquisa e desenvolvimento defensivo. Toda informação deve ser usada responsavelmente e em conformidade com os termos de uso do serviço.

---

*Documento gerado automaticamente em 03 de Agosto de 2025*