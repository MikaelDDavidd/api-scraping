# 🔄 Guia de Migração Flutter - Integração Scraper

Ajustes necessários no app Flutter para integrar com o novo sistema de scraping e database atualizado.

## 📋 **Problemas Identificados**

### 1. **Campo `emoji` Novo no Database**
- ✅ **Database**: Tem coluna `emoji` (JSONB)
- ❌ **Flutter**: StickerModel usa `emojis` (plural)
- ❌ **Repository**: Precisa ajustar queries

### 2. **Formato de Tray Image**
- ✅ **Scraper**: Gera `tray_${identifier}.png`
- ❌ **Flutter**: Espera `main_sticker_filename` diferente
- ❌ **URLs**: Precisam ser atualizadas

### 3. **Campo `name` vs `filename`**
- ✅ **Database**: Usa `name` na tabela stickers
- ❌ **Flutter**: StickerModel usa `filename`

### 4. **Novos Campos do Scraper**
- ✅ **Scraper**: Salva `identifier`, `publisher`, `lang`
- ❌ **Flutter**: Modelos não têm esses campos

## 🛠️ **Correções Necessárias**

### **1. Atualizar StickerModel**

```dart
// lib/app/data/models/sticker_model.dart
class StickerModel {
  final int id;
  final int packId;
  final String name;          // ← MUDOU: era 'filename'
  final List<String> emoji;   // ← MUDOU: era 'emojis' (plural)
  final int size;            // ← NOVO: tamanho do arquivo
  final DateTime createdAt;

  factory StickerModel.fromJson(Map<String, dynamic> json) {
    List<String> emojiList = [];
    if (json['emoji'] != null) {
      // Handle JSONB array from database
      if (json['emoji'] is List) {
        emojiList = List<String>.from(json['emoji']);
      } else if (json['emoji'] is String) {
        // Handle JSON string
        emojiList = List<String>.from(jsonDecode(json['emoji']));
      }
    }
    
    return StickerModel(
      id: json['id'] as int,
      packId: json['pack_id'] as int,
      name: json['name'] as String,        // ← MUDOU
      emoji: emojiList,                    // ← MUDOU
      size: json['size'] as int? ?? 0,     // ← NOVO
      createdAt: DateTime.parse(json['created_at'] as String),
    );
  }

  // Getters de compatibilidade
  String get filename => name;              // ← Backward compatibility
  List<String> get emojis => emoji;         // ← Backward compatibility
  List<String> get emojiList => emoji;

  String get stickerUrl => 
      'https://hmtohytskgvromvpuoom.supabase.co/storage/v1/object/public/stickers/$packIdentifier/$name';
      // ← MUDOU: agora inclui packIdentifier na URL
}
```

### **2. Atualizar StickerPackModel**

```dart
// lib/app/data/models/sticker_pack_model.dart
class StickerPackModel {
  final int id;
  final String identifier;        // ← NOVO: do scraper
  final String title;
  final String publisher;         // ← NOVO: era 'author'
  final String tray;             // ← NOVO: nome do arquivo tray
  final bool isAnimated;
  final int downloads;
  final String lang;             // ← NOVO: idioma
  final String origin;           // ← NOVO: origem (sticker.ly)
  final DateTime createdAt;
  
  // Relations
  final List<StickerModel>? stickers;

  factory StickerPackModel.fromJson(Map<String, dynamic> json) {
    return StickerPackModel(
      id: json['id'] as int,
      identifier: json['identifier'] as String,     // ← NOVO
      title: json['name'] as String,                // ← MUDOU: era 'title'
      publisher: json['publisher'] as String? ?? '',// ← NOVO
      tray: json['tray'] as String? ?? 'tray.png', // ← NOVO
      isAnimated: json['is_animated'] as bool? ?? false,
      downloads: json['downloads'] as int? ?? 0,
      lang: json['lang'] as String? ?? 'pt',       // ← NOVO
      origin: json['origin'] as String? ?? '',     // ← NOVO
      createdAt: DateTime.parse(json['created_at'] as String),
      stickers: json['stickers'] != null
          ? (json['stickers'] as List)
              .map((s) => StickerModel.fromJson(s))
              .toList()
          : null,
    );
  }

  // Getters de compatibilidade
  String? get author => publisher;               // ← Backward compatibility
  String? get mainStickerFilename => tray;      // ← Backward compatibility

  // URL da tray atualizada para novo formato
  String? get trayImageUrl => 
      'https://hmtohytskgvromvpuoom.supabase.co/storage/v1/object/public/stickers/$identifier/$tray';

  String? get mainStickerUrl => trayImageUrl;    // ← Backward compatibility

  String get packIdentifier => identifier;      // ← Usar do database
  String get publisherName => publisher;
}
```

### **3. Atualizar Repository Queries**

```dart
// lib/app/data/repositories/sticker_repository.dart

// Query para packs (atualizada)
Future<List<StickerPackModel>> getStickerPacks({
  int limit = 20,
  int offset = 0,
  bool? isAnimated,
  String? category,
  String? order,
}) async {
  try {
    var query = _supabase
        .from('packs')
        .select('''
          id,
          identifier,
          name,
          publisher,
          tray,
          is_animated,
          downloads,
          lang,
          origin,
          created_at,
          stickers:stickers(count)
        ''');

    // Aplicar filtros...
    
    final response = await query
        .range(offset, offset + limit - 1)
        .order('created_at', ascending: false);

    return response.map((json) => StickerPackModel.fromJson(json)).toList();
  } catch (e) {
    throw Exception('Erro ao buscar packs: $e');
  }
}

// Query para stickers (atualizada)
Future<List<StickerModel>> getStickersByPackId(int packId) async {
  try {
    final response = await _supabase
        .from('stickers')
        .select('''
          id,
          pack_id,
          name,
          emoji,
          size,
          created_at
        ''')
        .eq('pack_id', packId)
        .order('id');

    return response.map((json) => StickerModel.fromJson(json)).toList();
  } catch (e) {
    throw Exception('Erro ao buscar stickers: $e');
  }
}
```

### **4. Atualizar StickerService**

```dart
// lib/app/data/services/sticker_service.dart

// Ajustar _downloadStickerAssets para nova estrutura
Future<void> _downloadStickerAssets(StickerPackModel pack, Directory stickerDir) async {
  final dio = Dio();
  final downloads = <Future>[];

  // Download tray image - novo formato
  final trayUrl = pack.trayImageUrl;
  if (trayUrl != null) {
    final trayPath = '${stickerDir.path}/tray.png';
    downloads.add(dio.download(trayUrl, trayPath));
  }

  // Download stickers - nova URL com identifier
  if (pack.stickers != null) {
    for (int i = 0; i < pack.stickers!.length; i++) {
      final sticker = pack.stickers![i];
      final fileName = 'sticker_$i.webp';
      final stickerPath = '${stickerDir.path}/$fileName';
      
      // Nova URL: identifier/name
      final stickerUrl = 'https://hmtohytskgvromvpuoom.supabase.co/storage/v1/object/public/stickers/${pack.identifier}/${sticker.name}';
      downloads.add(dio.download(stickerUrl, stickerPath));
    }
  }

  await Future.wait(downloads);
}
```

### **5. Atualizar Controller (se necessário)**

```dart
// lib/app/modules/stickers/controllers/stickers_controller.dart

// O controller atual deve funcionar, mas pode precisar de ajustes menores:

Future<void> loadStickerPacks({
  bool refresh = false,
  bool? isAnimated,
  String? category,
  String? order,
}) async {
  // Passar novos parâmetros para o repository
  await _stickerService.loadStickerPacks(
    refresh: refresh,
    isAnimated: isAnimated,
    category: category,
    order: order,
  );
}
```

## 🗄️ **Estrutura Atual vs Nova**

### **Atual (Antigo)**
```
Storage: stickers/
├── pack123_sticker1.webp
├── pack123_sticker2.webp  
└── pack123_tray.png

Database: 
- packs.title (nome do pack)
- stickers.filename (nome do arquivo)
- stickers.emojis (lista de emojis)  
```

### **Novo (Scraper)**
```
Storage: stickers/
├── pack123/
│   ├── tray_pack123.png
│   ├── sticker1.webp
│   └── sticker2.webp

Database:
- packs.name (nome do pack)
- packs.identifier (ID único)
- packs.publisher (autor)
- packs.tray (nome do arquivo tray)
- stickers.name (nome do arquivo)  
- stickers.emoji (JSONB array)
```

## ✅ **Ordem de Implementação**

1. **Executar migração SQL** (se ainda não foi feita)
2. **Atualizar modelos** (StickerModel, StickerPackModel)
3. **Atualizar repository** (queries)
4. **Testar app** com novos dados
5. **Ajustar URLs** se necessário
6. **Rodar scraper** para popular com novos dados

## 🧪 **Testes**

Após implementar:
1. Verificar se packs carregam corretamente
2. Verificar se tray images aparecem
3. Verificar se stickers individuais carregam
4. Testar export para WhatsApp
5. Verificar se emojis funcionam

O scraper está **100% funcional** - só precisa do Flutter ajustado para usar os novos formatos!