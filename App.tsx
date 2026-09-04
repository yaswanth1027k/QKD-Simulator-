import React, { useState, useEffect, useCallback } from 'react';
import { HeaderTelemetry } from './components/HeaderTelemetry';
import { InteractiveTopology } from './components/InteractiveTopology';
import { EtsiKeyConsole } from './components/EtsiKeyConsole';
import { QuantumInterceptionSimulator } from './components/QuantumInterceptionSimulator';
import { LiveEncryptionSandbox } from './components/LiveEncryptionSandbox';
import { AuditLogModal } from './components/AuditLogModal';
import { 
  NodeId, 
  QuantumKeyMaterial, 
  SystemTelemetry, 
  AuditLogEntry 
} from './types/qkd';
import { CRITICAL_NODES } from './data/infrastructureNodes';
import { 
  generateLocalQuantumKey, 
  soundFx, 
  calculateShannonEntropy,
  hexToBytes
} from './utils/qkdCrypto';

export default function App() {
  // 1. API Configuration & Connection State
  const [apiUrl, setApiUrl] = useState<string>('https://quantum-key-distribution-7bv6.onrender.com');
  const [connectionStatus, setConnectionStatus] = useState<'CONNECTED' | 'COLD_START' | 'OFFLINE' | 'LOCAL_FALLBACK'>('LOCAL_FALLBACK');
  const [coldStartCountdown, setColdStartCountdown] = useState<number>(40);
  const [isTestingApi, setIsTestingApi] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState<boolean>(false);

  // 2. Topology State
  const [sourceNodeId, setSourceNodeId] = useState<NodeId>('substation-alpha');
  const [targetNodeId, setTargetNodeId] = useState<NodeId>('data-center-central');

  // 3. QKD Key Management State
  const [activeKey, setActiveKey] = useState<QuantumKeyMaterial | null>(null);
  const [keyBuffer, setKeyBuffer] = useState<QuantumKeyMaterial[]>([]);
  const [isGeneratingKey, setIsGeneratingKey] = useState<boolean>(false);

  // 4. Quantum Attack & Interception State
  const [isAttackActive, setIsAttackActive] = useState<boolean>(false);
  const [attackType, setAttackType] = useState<'PNS' | 'INTERCEPT_RESEND' | 'DETECTOR_BLIND'>('PNS');
  const [qberPercent, setQberPercent] = useState<number>(1.8);
  const [qberHistory, setQberHistory] = useState<number[]>([1.75, 1.82, 1.79, 1.84, 1.78, 1.81, 1.80]);

  // 5. System Telemetry State
  const [telemetry, setTelemetry] = useState<SystemTelemetry>({
    qberPercent: 1.8,
    keyGenRateKbps: 12.4,
    fiberDistanceKm: 45.2,
    photonCountRateMhz: 1.24,
    keyBufferCount: 32,
    siftingRatioPercent: 52.3,
    rawKeyRateKbps: 48.6,
    coincidenceWindowNs: 1.2
  });

  // 6. Security Audit Logs
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([
    {
      id: 'log-0',
      timestamp: new Date().toISOString(),
      level: 'INFO',
      category: 'ETSI_014',
      message: 'QKD KME Master Entity initialized. Ready for critical infrastructure key distribution.',
      details: 'Standard: ETSI GS QKD 014 V1.1.1 compliant. Post-Quantum ITS cryptographic mode enabled.'
    }
  ]);

  const addAuditLog = useCallback((
    level: AuditLogEntry['level'], 
    category: AuditLogEntry['category'], 
    message: string, 
    details?: string
  ) => {
    const entry: AuditLogEntry = {
      id: 'log-' + Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      details
    };
    setAuditLogs(prev => [entry, ...prev.slice(0, 99)]);
  }, []);

  // Sync fiber distance when nodes change
  useEffect(() => {
    const src = CRITICAL_NODES.find(n => n.id === sourceNodeId) || CRITICAL_NODES[0];
    const tgt = CRITICAL_NODES.find(n => n.id === targetNodeId) || CRITICAL_NODES[1];
    const dist = Math.abs(src.distanceKm - tgt.distanceKm) + 20.0;
    setTelemetry(prev => ({
      ...prev,
      fiberDistanceKm: Number(dist.toFixed(1))
    }));
  }, [sourceNodeId, targetNodeId]);

  // Telemetry & QBER Real-time Simulation Loop
  useEffect(() => {
    const interval = setInterval(() => {
      if (isAttackActive) {
        // High QBER in attack mode (> 11%)
        const attackQber = Number((14.0 + Math.random() * 5.5).toFixed(1));
        setQberPercent(attackQber);
        setQberHistory(prev => [...prev.slice(-24), attackQber]);
        setTelemetry(prev => ({
          ...prev,
          qberPercent: attackQber,
          keyGenRateKbps: 0.0,
          photonCountRateMhz: Number((0.45 + Math.random() * 0.2).toFixed(2))
        }));
      } else {
        // Nominal QBER around 1.8%
        const nominalQber = Number((1.6 + Math.random() * 0.4).toFixed(1));
        setQberPercent(nominalQber);
        setQberHistory(prev => [...prev.slice(-24), nominalQber]);
        setTelemetry(prev => ({
          ...prev,
          qberPercent: nominalQber,
          keyGenRateKbps: Number((12.0 + Math.random() * 0.8).toFixed(1)),
          photonCountRateMhz: Number((1.20 + Math.random() * 0.08).toFixed(2))
        }));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isAttackActive]);

  // Initial Key Generation on Mount
  useEffect(() => {
    const initialKey = generateLocalQuantumKey(
      sourceNodeId,
      targetNodeId,
      CRITICAL_NODES[0].saeId,
      CRITICAL_NODES[1].saeId,
      256
    );
    setActiveKey(initialKey);
    setKeyBuffer([initialKey]);
    addAuditLog('SUCCESS', 'ETSI_014', 'Bootstrapped initial 256-bit Quantum Key material via local entropy generator.');
  }, []);

  // Key TTL decrement loop
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveKey(prev => {
        if (!prev) return null;
        if (prev.remainingTtl <= 1) {
          // Key expired, replenish
          const newKey = generateLocalQuantumKey(sourceNodeId, targetNodeId);
          addAuditLog('WARN', 'CRYPTO', `Key [${prev.keyId.substring(0, 16)}...] expired (TTL reached). Regenerated quantum key.`);
          return newKey;
        }
        return {
          ...prev,
          remainingTtl: prev.remainingTtl - 1
        };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [sourceNodeId, targetNodeId, addAuditLog]);

  // Test Backend API Connectivity with Cold Start Countdown
  const handleTestConnection = async () => {
    setIsTestingApi(true);
    soundFx.playClick();
    addAuditLog('INFO', 'API', `Initiating KME handshake probe with ${apiUrl}...`);

    let coldStartTimer: NodeJS.Timeout | null = null;
    let secondsLeft = 40;
    setColdStartCountdown(40);
    setConnectionStatus('COLD_START');

    coldStartTimer = setInterval(() => {
      secondsLeft -= 1;
      setColdStartCountdown(secondsLeft);
      if (secondsLeft <= 0 && coldStartTimer) {
        clearInterval(coldStartTimer);
      }
    }, 1000);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s fast check

      // Clean trailing slash
      const cleanUrl = apiUrl.replace(/\/+$/, '');
      const response = await fetch(`${cleanUrl}/api/v1/keys`, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      }).catch(async () => {
        // Try root health check if keys endpoint differs
        return await fetch(`${cleanUrl}/`, {
          method: 'GET',
          signal: controller.signal
        });
      });

      clearTimeout(timeoutId);
      if (coldStartTimer) clearInterval(coldStartTimer);

      if (response && response.ok) {
        setConnectionStatus('CONNECTED');
        soundFx.playDecryptSuccess();
        addAuditLog('SUCCESS', 'API', `KME REST API sync established with ${cleanUrl}. Status: 200 OK.`);
      } else {
        setConnectionStatus('LOCAL_FALLBACK');
        addAuditLog('WARN', 'API', `KME Endpoint unreachable or returned error. Running in resilient high-fidelity local simulator mode.`);
      }
    } catch {
      if (coldStartTimer) clearInterval(coldStartTimer);
      setConnectionStatus('LOCAL_FALLBACK');
      addAuditLog('INFO', 'API', `KME Backend is sleeping (Render cold-start) or CORS-restricted. High-fidelity client simulator active.`);
    } finally {
      setIsTestingApi(false);
    }
  };

  // Generate Quantum Key (Connects to API or Fallback Synth)
  const handleGenerateKey = async (bitLength: number = 256) => {
    if (isAttackActive) {
      soundFx.playAttackAlarm();
      addAuditLog('CRITICAL', 'ATTACK', 'Key generation request REJECTED! Optical channel state disturbed by eavesdropper.');
      return;
    }

    setIsGeneratingKey(true);
    soundFx.playClick();
    addAuditLog('INFO', 'ETSI_014', `Requesting ${bitLength}-bit quantum key material for SAE Link: [${sourceNodeId}] -> [${targetNodeId}]`);

    const srcNode = CRITICAL_NODES.find(n => n.id === sourceNodeId) || CRITICAL_NODES[0];
    const tgtNode = CRITICAL_NODES.find(n => n.id === targetNodeId) || CRITICAL_NODES[1];

    let newKey: QuantumKeyMaterial | null = null;

    // Try fetching from real API if online
    if (connectionStatus === 'CONNECTED') {
      try {
        const cleanUrl = apiUrl.replace(/\/+$/, '');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);

        const res = await fetch(`${cleanUrl}/api/v1/keys/${tgtNode.saeId}/enc_keys?size=${bitLength}`, {
          method: 'GET',
          signal: controller.signal,
          headers: { 'Accept': 'application/json' }
        });
        clearTimeout(timeout);

        if (res.ok) {
          const data = await res.json();
          if (data && data.keys && data.keys.length > 0) {
            const first = data.keys[0];
            const rawBytes = hexToBytes(first.key);
            newKey = {
              keyId: first.key_ID || `urn:etsi:qkd:014:key:${Math.random().toString(36).substring(2)}`,
              keyHex: first.key,
              keyBytes: rawBytes,
              keyBitLength: bitLength,
              timestamp: new Date().toISOString(),
              sourceNodeId,
              targetNodeId,
              sourceSaeId: srcNode.saeId,
              targetSaeId: tgtNode.saeId,
              ttlSeconds: 300,
              remainingTtl: 300,
              entropyBits: calculateShannonEntropy(rawBytes),
              protocol: 'ETSI-GS-QKD-014',
              origin: 'API'
            };
            addAuditLog('SUCCESS', 'API', `Harvested key from remote KME server: ${newKey.keyId.substring(0, 24)}...`);
          }
        }
      } catch {
        // Fall back gracefully
      }
    }

    // Fallback to local quantum engine if API was asleep or failed
    if (!newKey) {
      await new Promise(r => setTimeout(r, 600)); // realistic quantum sifting delay
      newKey = generateLocalQuantumKey(sourceNodeId, targetNodeId, srcNode.saeId, tgtNode.saeId, bitLength);
      addAuditLog('SUCCESS', 'ETSI_014', `Generated local ETSI 014 Key: ${newKey.keyId.substring(0, 28)}... [Shannon Entropy: ${newKey.entropyBits}/8.0]`);
    }

    setActiveKey(newKey);
    setKeyBuffer(prev => [newKey!, ...prev.slice(0, 9)]);
    setTelemetry(prev => ({ ...prev, keyBufferCount: prev.keyBufferCount + 1 }));
    soundFx.playKeyGenerated();
    setIsGeneratingKey(false);
  };

  // Toggle Attack Simulation
  const handleToggleAttack = () => {
    const nextState = !isAttackActive;
    setIsAttackActive(nextState);

    if (nextState) {
      soundFx.playAttackAlarm();
      addAuditLog('CRITICAL', 'ATTACK', `Eavesdropper Interception Activated (${attackType})! QBER spiked above 11.0% threshold. Quantum state collapsed.`);
    } else {
      soundFx.playClick();
      addAuditLog('SUCCESS', 'QKD_PHY', 'Eavesdropper simulation terminated. Optical link restored to nominal 1.8% QBER.');
    }
  };

  // Key consumed during encryption
  const handleKeyConsumed = () => {
    addAuditLog('INFO', 'CRYPTO', `Quantum Key material consumed for mission command encryption.`);
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 font-mono selection:bg-cyan-500 selection:text-black">
      
      {/* 1. Top Header & System Telemetry */}
      <HeaderTelemetry
        apiUrl={apiUrl}
        setApiUrl={setApiUrl}
        connectionStatus={connectionStatus}
        coldStartCountdown={coldStartCountdown}
        onTestConnection={handleTestConnection}
        isTesting={isTestingApi}
        telemetry={telemetry}
        isAttackActive={isAttackActive}
        soundEnabled={soundEnabled}
        setSoundEnabled={setSoundEnabled}
        onOpenAuditLog={() => {
          soundFx.playClick();
          setIsAuditModalOpen(true);
        }}
      />

      {/* Main Command Center Dashboard */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        
        {/* 2. Interactive Topology & Node Selector */}
        <section id="panel-topology">
          <InteractiveTopology
            sourceNodeId={sourceNodeId}
            targetNodeId={targetNodeId}
            onSelectSource={setSourceNodeId}
            onSelectTarget={setTargetNodeId}
            isAttackActive={isAttackActive}
            qberPercent={qberPercent}
          />
        </section>

        {/* Middle Two-Column Grid: ETSI Key Console & Attack Simulator */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* 3. ETSI GS QKD 014 Key Console */}
          <section id="panel-etsi-key-console" className="lg:col-span-6">
            <EtsiKeyConsole
              activeKey={activeKey}
              keyBuffer={keyBuffer}
              onGenerateKey={handleGenerateKey}
              isGenerating={isGeneratingKey}
              sourceNodeId={sourceNodeId}
              targetNodeId={targetNodeId}
              isAttackActive={isAttackActive}
              onSelectBufferKey={(key) => {
                setActiveKey(key);
                addAuditLog('INFO', 'ETSI_014', `Switched active key to: ${key.keyId.substring(0, 24)}...`);
              }}
            />
          </section>

          {/* 4. Quantum Interception & Attack Simulator */}
          <section id="panel-attack-simulator" className="lg:col-span-6">
            <QuantumInterceptionSimulator
              isAttackActive={isAttackActive}
              onToggleAttack={handleToggleAttack}
              qberPercent={qberPercent}
              qberHistory={qberHistory}
              attackType={attackType}
              setAttackType={setAttackType}
            />
          </section>

        </div>

        {/* 5. Live Encryption Sandbox */}
        <section id="panel-encryption-sandbox">
          <LiveEncryptionSandbox
            activeKey={activeKey}
            sourceNodeId={sourceNodeId}
            targetNodeId={targetNodeId}
            onKeyConsumed={handleKeyConsumed}
          />
        </section>

      </main>

      {/* Footer info & standards compliance */}
      <footer className="border-t border-slate-800/80 bg-[#020617] py-6 text-center text-xs font-mono text-slate-400">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span className="uppercase tracking-wider font-bold">QKD Key Management Entity (KME) • Critical Infrastructure Security Core</span>
          <div className="flex items-center gap-3 text-[11px]">
            <span>ETSI GS QKD 014 V1.1.1</span>
            <span className="text-slate-600">•</span>
            <span>BB84 / Decoy-State Protocol</span>
            <span className="text-slate-600">•</span>
            <span className="text-emerald-400 font-bold">Zero-Trust Post-Quantum</span>
          </div>
        </div>
      </footer>

      {/* Audit Log Modal */}
      <AuditLogModal
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
        logs={auditLogs}
        onClearLogs={() => {
          setAuditLogs([]);
          addAuditLog('INFO', 'ETSI_014', 'Audit log cleared by operator.');
        }}
      />

    </div>
  );
}
