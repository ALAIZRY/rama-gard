import React, { useEffect, useRef, useState } from 'react';
import { BarcodeScanner } from '@capacitor/barcode-scanner';
import { AlertCircle, Camera, Check, X } from 'lucide-react';
import { useBackButtonClose } from '../hooks/useBackButtonClose';

interface CameraBarcodeScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onDetected: (barcode: string) => void;
  title?: string;
  allowContinuous?: boolean;
}

export interface ScannedBarcodeItem {
  id: string;
  code: string;
  timestamp: string;
}

// The previous implementation opened the camera through WebView getUserMedia + ZXing.
// On Android this is fragile because WebView camera permission handling differs by device.
// The project already ships the official Capacitor Barcode Scanner plugin, so Android now
// uses the native scanner and lets the plugin own camera permissions and the preview.
const ALL_FORMATS = 17 as any;
const BACK_CAMERA = 1 as any;
const ADAPTIVE_ORIENTATION = 3 as any;

const normalizeBarcodeText = (input: string): string => {
  if (!input) return '';
  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  let result = input.trim();
  for (let i = 0; i < arabicDigits.length; i++) {
    result = result.replace(new RegExp(arabicDigits[i], 'g'), String(i));
  }
  return result.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim();
};

export const CameraBarcodeScanner: React.FC<CameraBarcodeScannerProps> = ({
  isOpen = true,
  onClose,
  onDetected,
  title = 'محرك فحص الباركود الذكي',
  allowContinuous = true
}) => {
  const scanningRef = useRef(false);
  const mountedRef = useRef(true);
  const [error, setError] = useState<string | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [history, setHistory] = useState<ScannedBarcodeItem[]>([]);

  useBackButtonClose(isOpen, onClose);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      scanningRef.current = false;
    };
  }, []);

  const emitCode = (raw: string) => {
    const code = normalizeBarcodeText(raw);
    if (!code || !mountedRef.current) return;

    const now = Date.now();
    setLastCode(code);
    setHistory((prev) => [
      {
        id: `scan-${now}-${Math.random().toString(36).slice(2, 8)}`,
        code,
        timestamp: new Date().toLocaleTimeString('ar-SA', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })
      },
      ...prev
    ].slice(0, 50));

    onDetected(code);
  };

  const startNativeScanner = async () => {
    if (scanningRef.current || !isOpen) return;

    scanningRef.current = true;
    setError(null);
    setIsLaunching(true);

    try {
      const result = await BarcodeScanner.scanBarcode({
        hint: ALL_FORMATS,
        cameraDirection: BACK_CAMERA,
        scanOrientation: ADAPTIVE_ORIENTATION,
        scanInstructions: title,
        scanButton: true,
        scanText: 'إلغاء',
        cancelButtonAccessibilityLabel: 'إغلاق الماسح',
        torchButtonOnAccessibilityLabel: 'إطفاء الفلاش',
        torchButtonOffAccessibilityLabel: 'تشغيل الفلاش',
        android: {
          // ML Kit is the native Android engine. It does not depend on WebView camera APIs.
          scanningLibrary: 'mlkit'
        }
      } as any);

      const code = normalizeBarcodeText(result?.ScanResult || '');
      if (code) {
        emitCode(code);
        // Single-scan mode closes immediately. Continuous mode starts a fresh native scan.
        if (!allowContinuous) {
          onClose();
        }
      } else if (isOpen && allowContinuous && mountedRef.current) {
        // User closed the native scan without a result; do not loop unexpectedly.
      }
    } catch (err: any) {
      if (!mountedRef.current) return;
      const message = String(err?.message || err || '');
      const lower = message.toLowerCase();

      if (
        lower.includes('cancel') ||
        lower.includes('dismiss') ||
        lower.includes('user')
      ) {
        // Normal user cancellation.
      } else if (
        lower.includes('permission') ||
        lower.includes('denied') ||
        lower.includes('camera')
      ) {
        setError('لم يتم السماح للكاميرا. افتح إعدادات التطبيق ← الأذونات ← الكاميرا، ثم فعّل الكاميرا وحاول مرة أخرى.');
      } else {
        setError('تعذر تشغيل ماسح الباركود. أغلق الماسح وأعد المحاولة.');
      }
    } finally {
      scanningRef.current = false;
      if (mountedRef.current) setIsLaunching(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      scanningRef.current = false;
      setIsLaunching(false);
      setError(null);
      return;
    }

    // Start only after the component has mounted. The native plugin requests camera
    // permission itself and displays its own Android scanner UI.
    const timer = window.setTimeout(() => {
      void startNativeScanner();
    }, 120);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleManualSubmit = () => {
    const code = normalizeBarcodeText(manualInput);
    if (!code) return;
    emitCode(code);
    setManualInput('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4" dir="rtl">
      <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-blue-600 p-3 text-white">
              <Camera size={22} />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 dark:text-white">{title}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">ماسح Android الأصلي</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="إغلاق"
          >
            <X size={22} />
          </button>
        </div>

        {isLaunching && (
          <div className="mb-4 flex items-center gap-3 rounded-2xl bg-blue-50 p-4 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
            <Camera size={20} className="animate-pulse" />
            <span className="text-sm font-medium">جاري فتح الكاميرا الأصلية...</span>
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
            <div className="mb-2 flex items-center gap-2 font-bold">
              <AlertCircle size={20} />
              مشكلة في الكاميرا
            </div>
            <p className="text-sm leading-6">{error}</p>
            <button
              type="button"
              onClick={() => void startNativeScanner()}
              className="mt-3 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white"
            >
              إعادة المحاولة
            </button>
          </div>
        )}

        {lastCode && (
          <div className="mb-4 flex items-center gap-2 rounded-2xl bg-green-50 p-3 text-green-800 dark:bg-green-950/30 dark:text-green-200">
            <Check size={20} />
            <span className="text-sm font-bold">آخر باركود: {lastCode}</span>
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
          <label className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">
            إدخال الباركود يدويًا
          </label>
          <div className="flex gap-2">
            <input
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleManualSubmit();
              }}
              inputMode="numeric"
              autoComplete="off"
              placeholder="اكتب أو الصق الباركود"
              className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-3 text-left outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            />
            <button
              type="button"
              onClick={handleManualSubmit}
              className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white"
            >
              إدخال
            </button>
          </div>
        </div>

        {history.length > 0 && (
          <div className="mt-4 max-h-40 overflow-auto rounded-2xl bg-slate-50 p-3 dark:bg-slate-800">
            <div className="mb-2 text-xs font-bold text-slate-500">آخر عمليات المسح</div>
            {history.slice(0, 8).map((item) => (
              <div key={item.id} className="flex items-center justify-between border-b border-slate-200 py-2 last:border-0 dark:border-slate-700">
                <span className="font-mono text-sm font-bold" dir="ltr">{item.code}</span>
                <span className="text-xs text-slate-500">{item.timestamp}</span>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-xl border border-slate-300 px-4 py-3 font-bold text-slate-700 dark:border-slate-600 dark:text-slate-200"
        >
          إغلاق
        </button>
      </div>
    </div>
  );
};
