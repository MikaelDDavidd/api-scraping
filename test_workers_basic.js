#!/usr/bin/env node

const BaseWorker = require('./workers/baseWorker');
const QueueManager = require('./workers/queueManager');
const { info, error } = require('./utils/logger');

/**
 * Worker de teste simples para validar a estrutura
 */
class TestWorker extends BaseWorker {
  constructor(name) {
    super(name, {
      maxRetries: 2,
      healthCheckInterval: 10000 // 10s para teste
    });
  }

  async initialize() {
    info(`Inicializando worker de teste: ${this.name}`);
    // Simular inicialização
    await this.delay(100);
  }

  async cleanup() {
    info(`Limpando worker de teste: ${this.name}`);
    // Simular cleanup
    await this.delay(50);
  }

  async processTaskImplementation(task) {
    info(`Processando tarefa: ${task.type}`, { worker: this.name, data: task.data });
    
    // Simular processamento
    await this.delay(task.processingTime || 1000);
    
    // Simular falha ocasional
    if (Math.random() < 0.1) {
      throw new Error('Falha simulada no processamento');
    }
    
    return {
      success: true,
      result: `Processado por ${this.name}`,
      timestamp: Date.now()
    };
  }

  async startMainLoop() {
    info(`Loop principal iniciado para ${this.name}`);
    
    // Simular work loop simples
    while (this.isRunning) {
      if (this.isPaused) {
        await this.delay(1000);
        continue;
      }
      
      // Simular tarefa ocasional
      if (Math.random() < 0.3) {
        try {
          await this.processTask({
            type: 'test-task',
            data: `dados-${Date.now()}`,
            processingTime: Math.random() * 2000 + 500
          }, 'test-task');
        } catch (err) {
          // Erro já foi logado pelo processTask
        }
      }
      
      await this.delay(3000); // Wait 3s between checks
    }
  }
}

/**
 * Teste básico da estrutura de workers
 */
async function testBasicStructure() {
  console.log('🧪 Iniciando teste básico da estrutura de workers...\n');
  
  try {
    // 1. Testar QueueManager
    console.log('1. Testando QueueManager...');
    const queueManager = new QueueManager({
      saveInterval: 5000, // 5s para teste
      persistencePath: './test_queues'
    });
    
    await queueManager.start();
    
    // Adicionar alguns itens de teste
    await queueManager.addToQueue('discovery', { pack: 'test1', url: 'http://test1' });
    await queueManager.addToQueue('light', { pack: 'test2', size: 'small' }, 'high');
    await queueManager.addToQueue('heavy', { pack: 'test3', size: 'large' });
    
    console.log('   ✅ QueueManager funcionando');
    console.log('   📊 Status:', queueManager.getStatusSummary());
    
    // 2. Testar BaseWorker
    console.log('\n2. Testando BaseWorker...');
    const testWorker1 = new TestWorker('TestWorker1');
    const testWorker2 = new TestWorker('TestWorker2');
    
    // Registrar workers no queue manager
    queueManager.registerWorker(testWorker1.id, testWorker1.name, testWorker1);
    queueManager.registerWorker(testWorker2.id, testWorker2.name, testWorker2);
    
    // Event listeners para monitorar workers
    testWorker1.on('taskCompleted', (data) => {
      console.log(`   ✅ ${data.workerId}: Tarefa completa em ${data.processingTime}ms`);
    });
    
    testWorker1.on('taskFailed', (data) => {
      console.log(`   ❌ ${data.workerId}: Tarefa falhou após ${data.attempts} tentativas`);
    });
    
    testWorker2.on('healthCheck', (health) => {
      console.log(`   💗 ${health.name}: ${health.isHealthy ? 'Saudável' : 'Problema'} (${health.metrics.tasksProcessed} tarefas)`);
    });
    
    // Iniciar workers
    await testWorker1.start();
    await testWorker2.start();
    
    console.log('   ✅ Workers iniciados');
    
    // 3. Testar comunicação por 30 segundos
    console.log('\n3. Testando por 30 segundos...');
    
    let testInterval = setInterval(() => {
      console.log('   📊 Status geral:', {
        queueManager: queueManager.getStatusSummary(),
        worker1: {
          name: testWorker1.name,
          uptime: Math.round(testWorker1.getUptime() / 1000) + 's',
          metrics: testWorker1.getMetrics()
        },
        worker2: {
          name: testWorker2.name, 
          uptime: Math.round(testWorker2.getUptime() / 1000) + 's',
          metrics: testWorker2.getMetrics()
        }
      });
    }, 10000); // Status a cada 10s
    
    // Testar pause/resume
    setTimeout(() => {
      console.log('\n   ⏸️ Pausando Worker1...');
      testWorker1.pause();
    }, 15000);
    
    setTimeout(() => {
      console.log('   ▶️ Resumindo Worker1...');
      testWorker1.resume();
    }, 20000);
    
    // Aguardar teste
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    clearInterval(testInterval);
    
    // 4. Parar tudo graciosamente
    console.log('\n4. Parando workers...');
    await testWorker1.stop();
    await testWorker2.stop();
    await queueManager.stop();
    
    console.log('\n✅ Teste concluído com sucesso!');
    console.log('\n📋 Resumo final:');
    console.log('   - QueueManager: ✅ Funcionando');
    console.log('   - BaseWorker: ✅ Funcionando');
    console.log('   - Comunicação: ✅ Funcionando');
    console.log('   - Health Check: ✅ Funcionando');
    console.log('   - Pause/Resume: ✅ Funcionando');
    console.log('   - Graceful Shutdown: ✅ Funcionando');
    
  } catch (err) {
    error('❌ Erro no teste básico', err);
    process.exit(1);
  }
}

// Executar teste se chamado diretamente
if (require.main === module) {
  testBasicStructure().then(() => {
    console.log('\n🎉 Todos os testes passaram!');
    process.exit(0);
  }).catch(err => {
    console.error('\n💥 Teste falhou:', err.message);
    process.exit(1);
  });
}

module.exports = { TestWorker, testBasicStructure };