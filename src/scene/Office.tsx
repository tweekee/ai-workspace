import { useEffect, useRef, useState } from "react";
import { OfficeEngine, type SceneInput } from "./OfficeEngine";
export function Office(props: SceneInput) {
  const host = useRef<HTMLDivElement>(null),
    engine = useRef<OfficeEngine | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const [error, setError] = useState(false);
  useEffect(() => {
    const instance = new OfficeEngine(host.current!, latest.current);
    engine.current = instance;
    instance.start().catch(() => setError(true));
    return () => {
      instance.destroy();
      engine.current = null;
    };
  }, []);
  useEffect(() => {
    engine.current?.update(props);
  }, [props]);
  return (
    <div className="office-canvas" ref={host} data-testid="office-canvas">
      {error && (
        <div className="renderer-error">
          <h3>The office renderer could not start</h3>
          <p>
            Enable hardware acceleration in your browser or WebView2, then
            reload. Session details remain available.
          </p>
        </div>
      )}
    </div>
  );
}
