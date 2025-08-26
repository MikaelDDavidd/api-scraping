#!/usr/bin/env node

/**
 * Servidor simples para servir stickers localmente
 * Útil para desenvolvimento no Mac
 */

const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.STICKERS_PORT || 8080;
const STICKERS_DIR = path.join(__dirname, 'stickers');

// Middleware para CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Servir arquivos estáticos com cache
app.use('/stickers', express.static(STICKERS_DIR, {
  maxAge: '30d',
  immutable: true
}));

// Endpoint para listar packs
app.get('/api/packs', (req, res) => {
  try {
    if (!fs.existsSync(STICKERS_DIR)) {
      return res.json({ packs: [], total: 0 });
    }
    
    const packs = fs.readdirSync(STICKERS_DIR, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => {
        const packPath = path.join(STICKERS_DIR, dirent.name);
        const files = fs.readdirSync(packPath);
        const stickers = files.filter(f => f.endsWith('.webp')).length;
        const hasTray = files.includes('tray.png');
        
        return {
          id: dirent.name,
          name: dirent.name,
          stickers_count: stickers,
          has_tray: hasTray,
          url: `/stickers/${dirent.name}`
        };
      });
    
    res.json({
      packs,
      total: packs.length,
      total_stickers: packs.reduce((sum, p) => sum + p.stickers_count, 0)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Homepage com lista de packs
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>Stickers Server</title></head>
      <body>
        <h1>🎯 Stickers Server</h1>
        <p><a href="/api/packs">📋 Ver API dos Packs</a></p>
        <p><a href="/stickers">📁 Navegar Stickers</a></p>
        <script>
          fetch('/api/packs')
            .then(r => r.json())
            .then(data => {
              document.body.innerHTML += '<h2>📊 Estatísticas</h2>';
              document.body.innerHTML += '<p>Packs: ' + data.total + '</p>';
              document.body.innerHTML += '<p>Stickers: ' + data.total_stickers + '</p>';
            });
        </script>
      </body>
    </html>
  `);
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🎯 Stickers Server rodando em http://localhost:${PORT}`);
  console.log(`📁 Servindo: ${STICKERS_DIR}`);
  console.log(`📋 API: http://localhost:${PORT}/api/packs`);
  
  if (!fs.existsSync(STICKERS_DIR)) {
    console.log(`⚠️  Pasta ${STICKERS_DIR} não existe - será criada quando o scraper rodar`);
  }
});

module.exports = app;