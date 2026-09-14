/**
 * Script de teste para validar tratamento automático de animações
 * Testa os novos métodos de correção de duração e frames
 */

const ImageProcessor = require('./services/imageProcessor');
const fs = require('fs-extra');
const path = require('path');
const { info, error, warn } = require('./utils/logger');

async function testAnimatedTreatment() {
  console.log('\n🔬 Teste de Tratamento Automático de Animações\n');
  console.log('=' . repeat(50));
  
  const processor = new ImageProcessor();
  
  // Procurar por um arquivo animado existente para teste
  const testDir = './stickers';
  
  try {
    // Verificar se há stickers para testar
    if (!await fs.pathExists(testDir)) {
      console.log('⚠️  Diretório de stickers não encontrado. Execute o scraper primeiro.');
      return;
    }
    
    // Buscar arquivos WebP
    const packs = await fs.readdir(testDir);
    let testFile = null;
    let testPath = null;
    
    for (const pack of packs) {
      const packDir = path.join(testDir, pack);
      const files = await fs.readdir(packDir);
      const webpFiles = files.filter(f => f.endsWith('.webp'));
      
      if (webpFiles.length > 0) {
        testFile = webpFiles[0];
        testPath = path.join(packDir, testFile);
        break;
      }
    }
    
    if (!testPath) {
      console.log('⚠️  Nenhum arquivo WebP encontrado para teste.');
      return;
    }
    
    console.log(`\n📁 Arquivo de teste: ${testPath}`);
    console.log('-' . repeat(50));
    
    // Ler arquivo
    const buffer = await fs.readFile(testPath);
    console.log(`📊 Tamanho original: ${(buffer.length / 1024).toFixed(2)} KB`);
    
    // Obter informações detalhadas
    console.log('\n🔍 Analisando arquivo original...');
    const info = await processor.getWebPInfo(testPath);
    
    console.log(`\n📋 Informações do arquivo original:`);
    console.log(`  • Frames: ${info.totalFrames}`);
    console.log(`  • Duração total: ${info.duration}ms`);
    console.log(`  • Duração mín. frame: ${info.minFrameDuration}ms`);
    console.log(`  • Duração máx. frame: ${info.maxFrameDuration}ms`);
    console.log(`  • Duração média frame: ${info.avgFrameDuration}ms`);
    console.log(`  • Tamanho: ${info.size.w}x${info.size.h}`);
    
    // Verificar conformidade
    console.log('\n✅ Verificação de conformidade WhatsApp:');
    const issues = [];
    
    if (info.duration > 10000) {
      issues.push(`❌ Duração excede 10s (atual: ${info.duration}ms)`);
    } else {
      console.log(`  ✅ Duração OK (${info.duration}ms ≤ 10000ms)`);
    }
    
    if (info.minFrameDuration && info.minFrameDuration < 8) {
      issues.push(`❌ Frame muito rápido (mínimo: ${info.minFrameDuration}ms < 8ms)`);
    } else {
      console.log(`  ✅ Frame mínimo OK (${info.minFrameDuration}ms ≥ 8ms)`);
    }
    
    if (buffer.length > 450 * 1024) {
      issues.push(`❌ Tamanho excede limite conservador (${(buffer.length / 1024).toFixed(2)}KB > 450KB)`);
    } else {
      console.log(`  ✅ Tamanho OK (${(buffer.length / 1024).toFixed(2)}KB ≤ 450KB)`);
    }
    
    if (issues.length === 0) {
      console.log('\n✨ Arquivo já está em conformidade!');
      return;
    }
    
    // Aplicar tratamento se necessário
    console.log('\n⚠️  Problemas encontrados:');
    issues.forEach(issue => console.log(`  ${issue}`));
    
    console.log('\n🔧 Aplicando tratamento automático...');
    const outputPath = path.join('./temp', `treated_${Date.now()}.webp`);
    await fs.ensureDir('./temp');
    
    const treatment = await processor.treatAnimatedWebP(testPath, outputPath);
    
    if (treatment.treated) {
      console.log('\n✅ Tratamento aplicado com sucesso!');
      console.log(`\n📊 Comparação antes/depois:`);
      console.log(`  Frames: ${treatment.original.totalFrames} → ${treatment.final.totalFrames}`);
      console.log(`  Duração: ${treatment.original.duration}ms → ${treatment.final.duration}ms`);
      console.log(`  Frame mín: ${treatment.original.minFrameDuration}ms → ${treatment.final.minFrameDuration}ms`);
      
      const finalBuffer = await fs.readFile(outputPath);
      console.log(`  Tamanho: ${(buffer.length / 1024).toFixed(2)}KB → ${(finalBuffer.length / 1024).toFixed(2)}KB`);
      
      console.log(`\n💾 Arquivo tratado salvo em: ${outputPath}`);
      
      // Verificar conformidade final
      console.log('\n🎯 Verificação final:');
      if (treatment.final.duration <= 10000) {
        console.log(`  ✅ Duração OK (${treatment.final.duration}ms ≤ 10000ms)`);
      }
      if (!treatment.final.minFrameDuration || treatment.final.minFrameDuration >= 8) {
        console.log(`  ✅ Frame mínimo OK (${treatment.final.minFrameDuration}ms ≥ 8ms)`);
      }
      if (finalBuffer.length <= 450 * 1024) {
        console.log(`  ✅ Tamanho OK (${(finalBuffer.length / 1024).toFixed(2)}KB ≤ 450KB)`);
      }
    } else {
      console.log(`\n✅ Nenhum tratamento necessário: ${treatment.reason}`);
    }
    
  } catch (err) {
    console.error('\n❌ Erro durante teste:', err.message);
    console.error(err.stack);
  }
  
  console.log('\n' + '=' . repeat(50));
  console.log('Teste concluído!\n');
}

// Executar teste
testAnimatedTreatment().catch(console.error);