/**
 * AVISO DE SEGURANÇA:
 * Este script foi migrado para usar o Firebase Emulator (127.0.0.1:8080) por padrão.
 * Para testes completos de regras (anônimo, operador, admin, receipts append-only),
 * utilize: `npm run test:rules` (executa `firestore.rules.test.ts`).
 *
 * Nunca aponte este script para o banco de produção sem definir explicitamente:
 *   ALLOW_LIVE_DB_SMOKE_TEST=true
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, doc, setDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';

const useLiveDb = process.env.ALLOW_LIVE_DB_SMOKE_TEST === 'true';
const config = JSON.parse(readFileSync('./firebase-applet-config.json', 'utf8'));

if (!useLiveDb && !process.env.FIRESTORE_EMULATOR_HOST) {
  console.log('Modo seguro ativo: conectando ao Firebase Emulator (127.0.0.1:8080).');
  console.log('Dica: execute a suíte completa via `npm run test:rules`.');
}

const app = initializeApp(
  useLiveDb ? config : { projectId: 'demo-engenho-da-bola-rules-test' },
  'check-client'
);
const db = useLiveDb ? getFirestore(app, config.firestoreDatabaseId) : getFirestore(app);

if (!useLiveDb) {
  const [host, portStr] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
  connectFirestoreEmulator(db, host, Number(portStr) || 8080);
}

async function testOperatorSelfPromotion() {
  console.log('Testando tentativa de escrita direta sem credencial em staff...');
  try {
    await setDoc(doc(db, 'staff', 'tentativa-auto-promocao'), {
      uid: 'tentativa-auto-promocao',
      email: 'operador@engenhodabola.com',
      name: 'Operador Teste',
      role: 'admin',
      active: true,
      createdAt: new Date().toISOString()
    });
    console.error('❌ Falha: conseguiu gravar!');
    process.exit(1);
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? err.code : undefined;
    if (code === 'permission-denied') {
      console.log('✓ Bloqueio confirmado pelo servidor: permission-denied');
      process.exit(0);
    } else {
      console.log('Erro ao executar teste (verifique se o emulador está rodando):', code || (err instanceof Error ? err.message : err));
      process.exit(1);
    }
  }
}

testOperatorSelfPromotion();
