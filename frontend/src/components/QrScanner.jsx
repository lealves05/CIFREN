import { useEffect, useRef, useState } from 'react';
import { CameraOff } from 'lucide-react';
import Modal from './Modal';
import { Spinner } from './ui';

/**
 * Lê QR Code pela câmera. Usa o BarcodeDetector do navegador quando existe;
 * senão carrega o pacote jsqr só nesta hora.
 */
export default function QrScanner({ open, onClose, onResult }) {
  const video = useRef(null);
  const [state, setState] = useState('start'); // start | live | error
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    let stream = null;
    let stop = false;
    let timer = null;
    setState('start'); setError('');
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador não permite usar a câmera. Cole o código no campo de texto.');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (stop) return;
        const v = video.current;
        v.srcObject = stream;
        await v.play();
        setState('live');
        let detect;
        if ('BarcodeDetector' in window) {
          const det = new window.BarcodeDetector({ formats: ['qr_code'] });
          detect = async () => (await det.detect(v))[0]?.rawValue;
        } else {
          const { default: jsQR } = await import('jsqr');
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          detect = async () => {
            if (!v.videoWidth) return null;
            canvas.width = v.videoWidth; canvas.height = v.videoHeight;
            ctx.drawImage(v, 0, 0);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            return jsQR(img.data, img.width, img.height)?.data;
          };
        }
        const tick = async () => {
          if (stop) return;
          try {
            const text = await detect();
            if (text) { onResult(text); return; }
          } catch { /* quadro ruim: tenta o próximo */ }
          timer = setTimeout(tick, 250);
        };
        tick();
      } catch (e) {
        if (stop) return;
        setError(e?.name === 'NotAllowedError' ? 'A câmera foi bloqueada. Libere o acesso nas configurações do navegador ou cole o código.' : (e?.message || 'Não foi possível abrir a câmera.'));
        setState('error');
      }
    })();
    return () => {
      stop = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal open={open} onClose={onClose} size="sm" title="Ler QR Code" subtitle="Aponte a câmera para o QR da NFC-e ou do Pix."
      footer={<button type="button" className="btn-outline" onClick={onClose}>Fechar</button>}>
      {state === 'error' ? (
        <div role="alert" className="flex flex-col items-center gap-2 py-6 text-center text-sm text-ink-soft">
          <CameraOff className="h-8 w-8 text-ink-faint" aria-hidden="true" />{error}
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-app-sm bg-black">
          <video ref={video} className="aspect-square w-full object-cover" muted playsInline aria-label="Imagem da câmera" />
          <div className="pointer-events-none absolute inset-8 rounded-lg border-2 border-white/70" aria-hidden="true" />
          {state === 'start' && <div className="absolute inset-0 grid place-items-center text-white"><Spinner className="h-6 w-6" /></div>}
        </div>
      )}
    </Modal>
  );
}
