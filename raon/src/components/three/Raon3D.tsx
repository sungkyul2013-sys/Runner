import { useEffect, useRef, useState } from 'react';
import { AREAS } from '../ui';
import { reducedMotion } from '../../lib/motion';

/** 입체 '라온' 자모와 다섯 영역 이름표. WebGL 을 못 쓰면 평면 글자로 보여 준다. */
export function Raon3D({ labels = true }: { labels?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const api = useRef<{ pop(i: number): void } | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'flat'>('loading');
  const [active, setActive] = useState(-1);

  useEffect(() => {
    let alive = true;
    let dispose = () => {};
    import('./raonScene')
      .then(({ mountRaon }) => {
        if (!alive || !canvas.current) return;
        const s = mountRaon(canvas.current, {
          reduced: reducedMotion(),
          onPick: (i) => {
            setActive(i);
            window.setTimeout(() => setActive((a) => (a === i ? -1 : a)), 900);
          },
          onHover: (i) => setActive(i),
        });
        api.current = s;
        dispose = s.dispose;
        setState('ready');
      })
      .catch(() => alive && setState('flat'));
    return () => {
      alive = false;
      dispose();
    };
  }, []);

  return (
    <div className={`raon3d is-${state}`}>
      <div className="raon3d-stage">
        <canvas ref={canvas} aria-hidden="true" />
        {state === 'flat' && <p className="raon3d-flat grad-text">라온</p>}
      </div>
      {labels && (
        <ul className="raon3d-chips" aria-label="라온의 다섯 자모와 국어의 다섯 영역">
          {AREAS.map((a, i) => (
            <li key={a.key} style={{ ['--c' as string]: a.color, ['--i' as string]: i }} className={active === i ? 'is-on' : ''}>
              <button type="button" onClick={() => api.current?.pop(i)} onPointerEnter={() => setActive(i)} onPointerLeave={() => setActive(-1)}>
                <b>{a.jamo}</b>
                {a.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
