#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Configuração
const STICKERS_DIR = path.join(__dirname, '../stickers_vps');
const BACKUP_DIR = path.join(__dirname, 'backups', new Date().toISOString().split('T')[0]);

// Limites WhatsApp para animadas
const MAX_ANIMATED_SIZE_KB = 500;
const SAFE_ANIMATED_SIZE_KB = 450; // Margem de segurança

// Cores para output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

/**
 * Analisa um arquivo WebP para detectar se é animado ou estático
 */
async function analyzeWebP(filePath) {
    try {
        const stats = await fs.stat(filePath);
        const sizeKB = stats.size / 1024;
        
        // Método 1: webpinfo (mais preciso para WebP animados)
        let isAnimated = false;
        let width = 512;
        let height = 512;
        let duration = 0;
        let frames = 1;
        
        try {
            const webpCmd = `webpinfo "${filePath}" 2>/dev/null`;
            const { stdout: webpOut } = await execPromise(webpCmd);
            
            // Procurar por indicadores de animação
            if (webpOut.includes('Animation: 1') || webpOut.includes('ANMF at offset')) {
                isAnimated = true;
                
                // Extrair dimensões do Canvas
                const canvasMatch = webpOut.match(/Canvas size\s+(\d+)\s+x\s+(\d+)/);
                if (canvasMatch) {
                    width = parseInt(canvasMatch[1]);
                    height = parseInt(canvasMatch[2]);
                }
                
                // Calcular duração aproximada contando frames e duração por frame
                const frameMatches = webpOut.match(/Duration:\s+(\d+)/g);
                if (frameMatches && frameMatches.length > 0) {
                    frames = frameMatches.length;
                    const totalMs = frameMatches.reduce((sum, match) => {
                        const dur = parseInt(match.split(':')[1].trim());
                        return sum + dur;
                    }, 0);
                    duration = totalMs / 1000; // Converter para segundos
                }
            }
        } catch (e) {
            // Se webpinfo falhar, usar ffprobe como fallback
            try {
                const cmd = `ffprobe -v error -select_streams v:0 -count_packets -show_entries stream=nb_frames,width,height,duration -of json "${filePath}" 2>/dev/null`;
                const { stdout } = await execPromise(cmd);
                
                const data = JSON.parse(stdout);
                if (data.streams && data.streams[0]) {
                    const stream = data.streams[0];
                    frames = parseInt(stream.nb_frames) || 1;
                    width = parseInt(stream.width) || 512;
                    height = parseInt(stream.height) || 512;
                    duration = parseFloat(stream.duration) || 0;
                    isAnimated = frames > 1;
                }
            } catch (e2) {
                // Se ambos falharem, assume estático
                isAnimated = false;
            }
        }
        
        return {
            filePath,
            sizeKB,
            width,
            height,
            duration,
            frames,
            isAnimated
        };
        
    } catch (error) {
        console.error(`Erro ao analisar ${filePath}:`, error.message);
        return null;
    }
}

/**
 * Verifica se o sticker animado atende os requisitos
 */
function checkAnimatedRequirements(info) {
    const issues = [];
    
    // Verificar tamanho - só considera problema se passar do limite oficial (500KB)
    if (info.sizeKB > MAX_ANIMATED_SIZE_KB) {
        issues.push(`Tamanho: ${info.sizeKB.toFixed(1)}KB > ${MAX_ANIMATED_SIZE_KB}KB (limite oficial)`);
    } else if (info.sizeKB > SAFE_ANIMATED_SIZE_KB) {
        issues.push(`Tamanho: ${info.sizeKB.toFixed(1)}KB > ${SAFE_ANIMATED_SIZE_KB}KB (margem segurança)`);
    }
    
    // Verificar dimensões (deve ser 512x512)
    if (info.width !== 512 || info.height !== 512) {
        issues.push(`Dimensões: ${info.width}x${info.height} (deve ser 512x512)`);
    }
    
    // Verificar duração (máximo 10 segundos)
    if (info.duration > 10) {
        issues.push(`Duração: ${info.duration.toFixed(1)}s > 10s`);
    }
    
    return issues;
}

/**
 * Processa sticker animado não conforme
 */
async function processAnimatedSticker(filePath, info) {
    const tempFile = `${filePath}.temp.webp`;
    const backupFile = path.join(BACKUP_DIR, path.basename(filePath));
    
    try {
        // Fazer backup
        await fs.mkdir(path.dirname(backupFile), { recursive: true });
        await fs.copyFile(filePath, backupFile);
        
        console.log(`      🔧 ${colors.cyan}Iniciando correção...${colors.reset}`);
        console.log(`      💾 Backup criado: ${path.basename(backupFile)}`);
        
        // Estratégias múltiplas (ordem de prioridade) - ajustado para garantir ≤ 10s
        // Para stickers com 590ms/frame: 10s ÷ 0.59s = ~17 frames máximo
        const strategies = [
            { name: 'ImageMagick Conservador', desc: 'Limite 17 frames, Quality=35', cmd: `magick "${filePath}[0-16]" -resize 512x512! -quality 35 -define webp:lossless=false -define webp:method=6 "${tempFile}"` },
            { name: 'ImageMagick Moderado', desc: 'Limite 13 frames, Quality=30', cmd: `magick "${filePath}[0-12]" -resize 512x512! -quality 30 -define webp:lossless=false -define webp:method=6 "${tempFile}"` },
            { name: 'ImageMagick Agressivo', desc: 'Limite 10 frames, Quality=25', cmd: `magick "${filePath}[0-9]" -resize 512x512! -quality 25 -define webp:lossless=false -define webp:method=6 "${tempFile}"` },
            { name: 'cwebp Google', desc: 'WebP nativo, Quality=35', cmd: `cwebp -q 35 -m 6 -resize 512 512 "${filePath}" -o "${tempFile}"` }
        ];
        
        let success = false;
        for (let i = 0; i < strategies.length && !success; i++) {
            const strategy = strategies[i];
            console.log(`      ${colors.blue}[${i + 1}/${strategies.length}] ${strategy.name}${colors.reset} (${strategy.desc})`);
            
            try {
                await execPromise(strategy.cmd + ' 2>/dev/null');
                
                // Verificar se arquivo temporário foi criado
                try {
                    await fs.access(tempFile);
                } catch {
                    console.log(`        ${colors.red}❌ Falhou${colors.reset} - Arquivo não foi gerado`);
                    continue; // Arquivo temporário não foi criado, tenta próxima estratégia
                }
                
                // Verificar resultado
                const newInfo = await analyzeWebP(tempFile);
                if (newInfo && newInfo.sizeKB <= MAX_ANIMATED_SIZE_KB && newInfo.sizeKB > 0 && 
                    newInfo.width === 512 && newInfo.height === 512 && newInfo.duration <= 10) {
                    await fs.rename(tempFile, filePath);
                    console.log(`        ${colors.green}✅ SUCESSO!${colors.reset} ${info.sizeKB.toFixed(1)}KB→${newInfo.sizeKB.toFixed(1)}KB, ${info.duration.toFixed(1)}s→${newInfo.duration.toFixed(1)}s`);
                    success = true;
                } else {
                    // Log detalhado do que falhou
                    if (newInfo) {
                        console.log(`        ${colors.red}❌ Falhou${colors.reset} - Ainda fora dos requisitos:`);
                        if (newInfo.sizeKB > MAX_ANIMATED_SIZE_KB) console.log(`          • Tamanho: ${newInfo.sizeKB.toFixed(1)}KB > ${MAX_ANIMATED_SIZE_KB}KB`);
                        if (newInfo.width !== 512 || newInfo.height !== 512) console.log(`          • Dimensões: ${newInfo.width}x${newInfo.height} ≠ 512x512`);
                        if (newInfo.duration > 10) console.log(`          • Duração: ${newInfo.duration.toFixed(1)}s > 10s`);
                    } else {
                        console.log(`        ${colors.red}❌ Falhou${colors.reset} - Não foi possível analisar resultado`);
                    }
                    await fs.unlink(tempFile).catch(() => {});
                }
            } catch (cmdError) {
                console.log(`        ${colors.red}❌ Falhou${colors.reset} - Erro no comando: ${cmdError.message.split('\n')[0]}`);
                await fs.unlink(tempFile).catch(() => {});
            }
        }
        
        if (!success) {
            console.log(`      ${colors.red}🚫 FALHA TOTAL${colors.reset} - Nenhuma estratégia funcionou`);
            return false;
        }
        
        console.log(`      ${colors.green}🎉 ARQUIVO CORRIGIDO COM SUCESSO!${colors.reset}`);
        return true;
        
    } catch (error) {
        console.log(`    ${colors.red}❌ Erro no processamento: ${error.message}${colors.reset}`);
        try { await fs.unlink(tempFile); } catch {}
        return false;
    }
}

/**
 * Processa um pack
 */
async function processPack(packPath) {
    const packName = path.basename(packPath);
    
    try {
        const files = await fs.readdir(packPath);
        const webpFiles = files.filter(f => f.endsWith('.webp'));
        
        if (webpFiles.length === 0) {
            return { pack: packName, status: 'empty' };
        }
        
        let animatedCount = 0;
        let staticCount = 0;
        let animatedOkCount = 0;
        let fixedCount = 0;
        let failedCount = 0;
        
        console.log(`  📋 Analisando ${webpFiles.length} arquivos...`);
        
        for (let i = 0; i < webpFiles.length; i++) {
            const file = webpFiles[i];
            const progress = `[${(i + 1).toString().padStart(2)}/${webpFiles.length.toString().padStart(2)}]`;
            console.log(`  ${progress} ${file}`);
            const filePath = path.join(packPath, file);
            const info = await analyzeWebP(filePath);
            
            if (!info) {
                console.log(`    ${colors.red}❌ Erro na análise${colors.reset} - Arquivo corrompido ou ilegível`);
                continue;
            }
            
            if (info.isAnimated) {
                animatedCount++;
                
                // Só processar se realmente violar os requisitos oficiais
                const needsProcessing = info.sizeKB > MAX_ANIMATED_SIZE_KB || 
                                       info.width !== 512 || info.height !== 512 || 
                                       info.duration > 10;
                
                if (needsProcessing) {
                    console.log(`    ${colors.yellow}⚠️ PRECISA CORREÇÃO:${colors.reset}`);
                    
                    if (info.sizeKB > MAX_ANIMATED_SIZE_KB) {
                        console.log(`      - Tamanho: ${info.sizeKB.toFixed(1)}KB > ${MAX_ANIMATED_SIZE_KB}KB`);
                    }
                    if (info.width !== 512 || info.height !== 512) {
                        console.log(`      - Dimensões: ${info.width}x${info.height} (deve ser 512x512)`);
                    }
                    if (info.duration > 10) {
                        console.log(`      - Duração: ${info.duration.toFixed(1)}s > 10s`);
                    }
                    
                    // Tentar corrigir
                    try {
                        const fixed = await processAnimatedSticker(filePath, info);
                        if (fixed) {
                            fixedCount++;
                        } else {
                            failedCount++;
                        }
                    } catch (processingError) {
                        console.log(`      ${colors.red}❌ Erro grave no processamento: ${processingError.message}${colors.reset}`);
                        failedCount++;
                    }
                } else {
                    // Animado mas OK
                    console.log(`    ${colors.green}✅ Animado OK${colors.reset} (${info.sizeKB.toFixed(1)}KB, ${info.width}x${info.height}, ${info.duration.toFixed(1)}s)`);
                    animatedOkCount++;
                }
                
            } else {
                // Estático - já está OK
                console.log(`    ${colors.green}✅ Estático OK${colors.reset} (${info.sizeKB.toFixed(1)}KB, ${info.width}x${info.height})`);
                staticCount++;
            }
        }
        
        return {
            pack: packName,
            status: 'processed',
            total: webpFiles.length,
            animated: animatedCount,
            animatedOk: animatedOkCount,
            static: staticCount,
            fixed: fixedCount,
            failed: failedCount
        };
        
    } catch (error) {
        console.error(`Erro ao processar pack ${packName}:`, error.message);
        return { pack: packName, status: 'error', error: error.message };
    }
}

/**
 * Função principal
 */
async function main() {
    console.log(`${colors.bright}${colors.magenta}`);
    console.log('================================================================================');
    console.log('🔍 VERIFICADOR E CORRETOR DE STICKERS');
    console.log('================================================================================');
    console.log(colors.reset);
    
    console.log(`📂 Diretório: ${STICKERS_DIR}`);
    console.log(`📏 Requisitos WhatsApp: 512x512, Animadas ≤ ${SAFE_ANIMATED_SIZE_KB}KB, Duração ≤ 10s`);
    console.log(`✅ Stickers estáticos são ignorados (já OK)\n`);
    
    try {
        // Verificar se diretório existe
        await fs.access(STICKERS_DIR);
        
        // Listar packs
        const packs = await fs.readdir(STICKERS_DIR);
        const packDirs = [];
        
        for (const pack of packs) {
            const packPath = path.join(STICKERS_DIR, pack);
            const stat = await fs.stat(packPath);
            if (stat.isDirectory()) {
                packDirs.push(packPath);
            }
        }
        
        console.log(`${colors.cyan}📦 Total de packs: ${packDirs.length}${colors.reset}\n`);
        
        // Processar packs
        const results = {
            totalPacks: packDirs.length,
            processedPacks: 0,
            totalAnimated: 0,
            totalStatic: 0,
            totalFixed: 0,
            totalFailed: 0
        };
        
        for (let i = 0; i < packDirs.length; i++) {
            const packPath = packDirs[i];
            const packName = path.basename(packPath);
            
            console.log(`\n${colors.blue}📦 Pack ${i + 1}/${packDirs.length}: ${packName}${colors.reset}`);
            
            const result = await processPack(packPath);
            
            if (result.status === 'empty') {
                console.log(`  📭 Pack vazio`);
            } else if (result.status === 'processed') {
                results.processedPacks++;
                results.totalAnimated += result.animated;
                results.totalStatic += result.static;
                results.totalFixed += result.fixed;
                results.totalFailed += result.failed;
                
                // Resumo detalhado do pack
                console.log(`  📊 ${colors.bright}Resumo do Pack:${colors.reset}`);
                if (result.static > 0) console.log(`    • ${colors.green}${result.static} estáticos OK${colors.reset}`);
                if (result.animatedOk > 0) console.log(`    • ${colors.green}${result.animatedOk} animados OK${colors.reset}`);
                if (result.fixed > 0) console.log(`    • ${colors.yellow}${result.fixed} corrigidos${colors.reset}`);
                if (result.failed > 0) console.log(`    • ${colors.red}${result.failed} falharam${colors.reset}`);
                
                const status = (result.failed === 0) ? `${colors.green}✅ Pack Completo${colors.reset}` : `${colors.yellow}⚠️ Pack com Falhas${colors.reset}`;
                console.log(`    ${status}`);
            }
        }
        
        // Resumo final
        console.log(`\n${colors.bright}${colors.cyan}`);
        console.log('================================================================================');
        console.log('📊 RESUMO FINAL');
        console.log('================================================================================');
        console.log(colors.reset);
        
        console.log(`📦 Packs processados: ${results.processedPacks}/${results.totalPacks}`);
        console.log(`🎬 Stickers animados: ${results.totalAnimated}`);
        console.log(`🖼️ Stickers estáticos: ${results.totalStatic}`);
        console.log(`${colors.green}✅ Corrigidos: ${results.totalFixed}${colors.reset}`);
        console.log(`${colors.red}❌ Falharam: ${results.totalFailed}${colors.reset}`);
        
        if (results.totalFixed > 0) {
            console.log(`\n📁 Backups salvos em: ${BACKUP_DIR}`);
        }
        
    } catch (error) {
        console.error(`\n${colors.red}❌ Erro fatal: ${error.message}${colors.reset}`);
        process.exit(1);
    }
}

// Executar
main().catch(console.error);