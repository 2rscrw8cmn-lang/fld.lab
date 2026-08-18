import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export function NetworkStatus() {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div className="flex min-h-10 items-center justify-center gap-2 border-b border-warning/35 bg-warning/10 px-4 py-2 text-center text-xs font-bold text-warning" role="status" aria-live="polite">
      <WifiOff aria-hidden={true} size={15} />
      Offline — saved data can be viewed only if it is already loaded. New results remain unsaved until you reconnect and retry.
    </div>
  );
}
